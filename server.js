const express = require('express');
const { Token, TwitterLabel } = require('./models/db');
const cors = require('cors');
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 10 }); // 10秒缓存

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 添加一个辅助函数来标准化推特URL
function normalizeTwitterUrl(url) {
    return url.replace('@', '')
              .replace('https://', '')
              .replace('http://', '')
              .replace('x.com/', '')
              .replace('twitter.com/', '')
              .split('/')[0];  // 只保留用户名部分
}

// 获取代币列表
app.get('/api/tokens', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const duplicatesOnly = req.query.duplicatesOnly === 'true';
        const groupNumber = req.query.groupNumber ? parseInt(req.query.groupNumber) : null; // 确保转换为数字
        
        // 修改缓存键，加入组号
        const cacheKey = `tokens_page_${page}_${duplicatesOnly}_${groupNumber || 'all'}`;
        
        // 检查缓存
        const cachedData = cache.get(cacheKey);
        if (cachedData) {
            return res.json(cachedData);
        }

        const limit = 11;
        const skip = (page - 1) * limit;

        // 构建查询条件
        let query = {};
        if (groupNumber !== null) {
            // 查询特定重复组
            query.duplicateGroup = groupNumber;
        } else if (duplicatesOnly) {
            // 查询所有重复代币
            query.duplicateGroup = { $ne: null };
        }

        // 使用Promise.all并行执行查询
        const [tokens, total] = await Promise.all([
            Token.find(query)
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Token.countDocuments(query)
        ]);

        // 调整时间为 UTC+8
        tokens.forEach(token => {
            token.timestamp = new Date(new Date(token.timestamp).getTime() + 8 * 60 * 60 * 1000);
        });

        const result = {
            tokens,
            total,
            page,
            pages: Math.ceil(total / limit)
        };
        
        // 设置缓存
        cache.set(cacheKey, result);
        
        res.json(result);
    } catch (error) {
        console.error('获取数据失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 获取重复代币列表
app.get('/api/duplicate-tokens', async (req, res) => {
    try {
        const cacheKey = 'duplicate_tokens';
        
        // 检查缓存
        const cachedData = cache.get(cacheKey);
        if (cachedData) {
            return res.json(cachedData);
        }

        const duplicateGroups = await Token.distinct('duplicateGroup', {
            duplicateGroup: { $ne: null }
        });

        const duplicateTokensInfo = await Promise.all(duplicateGroups.map(async (groupNumber) => {
            const tokens = await Token.find({ duplicateGroup: groupNumber })
                .sort({ timestamp: -1})
                .lean();

            if (tokens.length === 0) return null;

            // 检查组内是否有完整的推特链接
            const hasFullTwitterLink = tokens.some(token => 
                token.duplicateType === 'twitter_status' && 
                token.metadata?.twitter?.toLowerCase().includes('/status/')
            );

            const timestamps = tokens.map(t => new Date(t.timestamp).getTime() + 8 * 60 * 60 * 1000);
            const latestTime = Math.max(...timestamps);
            const firstTime = Math.min(...timestamps);
            
            let previousTime = null;
            if (timestamps.length > 1) {
                const sortedTimes = [...timestamps].sort((a, b) => b - a);
                previousTime = sortedTimes[1];
            }

            // 找到包含完整推特链接的代币
            const twitterToken = hasFullTwitterLink ? 
                tokens.find(t => t.duplicateType === 'twitter_status' && 
                    t.metadata?.twitter?.toLowerCase().includes('/status/')) : null;

            return {
                groupNumber,
                type: tokens[0].duplicateType,
                symbol: tokens[0].symbol,
                metadata: tokens[0].metadata,
                latestTime: new Date(latestTime),
                previousTime: previousTime ? new Date(previousTime) : null,
                firstTime: new Date(firstTime),
                count: tokens.length,
                hasFullTwitterLink,
                twitterLink: twitterToken?.metadata?.twitter || null
            };
        }));

        const validGroups = duplicateTokensInfo
            .filter(group => group !== null)
            .sort((a, b) => b.latestTime - a.latestTime);

        cache.set(cacheKey, validGroups);
        res.json(validGroups);
    } catch (error) {
        console.error('获取重复代币失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 获取所有推特标签
app.get('/api/twitter-labels', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 5; // 每页5条
        const skip = (page - 1) * limit;

        // 使用Promise.all并行执行查询
        const [labels, total] = await Promise.all([
            TwitterLabel.find()
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            TwitterLabel.countDocuments()
        ]);

        res.json({
            labels,
            total,
            page,
            pages: Math.ceil(total / limit)
        });
    } catch (error) {
        console.error('获取推特标签失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 添加或更新推特标签
app.post('/api/twitter-labels', async (req, res) => {
    try {
        const { twitterUrl, label, color } = req.body;
        
        const result = await TwitterLabel.findOneAndUpdate(
            { twitterUrl },
            { 
                twitterUrl,
                label,
                color,
                timestamp: new Date()
            },
            { upsert: true, new: true }
        );
        
        res.json(result);
    } catch (error) {
        console.error('保存推特标签失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 删除推特标签
app.delete('/api/twitter-labels/:id', async (req, res) => {
    try {
        await TwitterLabel.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error('删除推特标签失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 修改特定重复组的获取端点，添加分页支持
app.get('/api/duplicate-group-tokens/:groupNumber', async (req, res) => {
    try {
        const groupNumber = parseInt(req.params.groupNumber);
        const page = parseInt(req.query.page) || 1;
        const limit = 11; // 每页显示11条记录
        const skip = (page - 1) * limit;
        
        // 使用 Promise.all 并行执行查询
        const [tokens, total] = await Promise.all([
            Token.find({ duplicateGroup: groupNumber })
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Token.countDocuments({ duplicateGroup: groupNumber })
        ]);

        // 调整时间为 UTC+8
        tokens.forEach(token => {
            token.timestamp = new Date(new Date(token.timestamp).getTime() + 8 * 60 * 60 * 1000);
        });

        // 返回分页数据
        const result = {
            tokens,
            total,
            page,
            pages: Math.ceil(total / limit)
        };

        res.json(result);
    } catch (error) {
        console.error('获取重复组代币失败:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
}); 