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

        // 调整时间为 UTC+4
        tokens.forEach(token => {
            token.timestamp = new Date(new Date(token.timestamp).getTime() + 4 * 60 * 60 * 1000);
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
        const { query } = req.query;
        const cacheKey = query ? `duplicate_tokens_search_${query}` : 'duplicate_tokens';
        
        // 构建基础查询条件
        let baseQuery = { duplicateGroup: { $ne: null } };
        
        // 如果有搜索查询，添加搜索条件
        if (query) {
            baseQuery = {
                ...baseQuery,
                $or: [
                    { symbol: new RegExp(query, 'i') },  // 使用模糊匹配而不是精确匹配
                    { mint: new RegExp(query, 'i') }
                ]
            };
        }

        // 获取匹配的重复组号
        const matchingTokens = await Token.find(baseQuery).lean();
        const duplicateGroups = [...new Set(matchingTokens.map(token => token.duplicateGroup))];

        const duplicateTokensInfo = await Promise.all(duplicateGroups.map(async (groupNumber) => {
            const tokens = await Token.find({ duplicateGroup: groupNumber })
                .sort({ timestamp: -1 })
                .lean();

            if (tokens.length === 0) return null;

            // 获取最新和最早的时间戳，并统一加4小时调整时区
            const latestTime = new Date(tokens[0].timestamp).getTime() + 4 * 60 * 60 * 1000;
            const previousTime = tokens[1]?.timestamp 
                ? new Date(tokens[1].timestamp).getTime() + 4 * 60 * 60 * 1000 
                : null;
            const firstTime = new Date(tokens[tokens.length - 1].timestamp).getTime() + 4 * 60 * 60 * 1000;

            // 检查是否有完整的推特链接
            const twitterToken = tokens.find(t => 
                t.metadata?.twitter?.includes('twitter.com/') || 
                t.metadata?.twitter?.includes('x.com/')
            );
            const hasFullTwitterLink = !!twitterToken;

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

        // 设置缓存
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
            token.timestamp = new Date(new Date(token.timestamp).getTime() + 4 * 60 * 60 * 1000);
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

// 新增搜索接口
app.get('/api/tokens/search', async (req, res) => {
    try {
        const { query } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = 11;
        const skip = (page - 1) * limit;

        if (!query) {
            return res.json({
                tokens: [],
                total: 0,
                page: 1,
                pages: 0
            });
        }

        // 构建查询条件，忽略大小写
        const searchQuery = {
            $or: [
                { symbol: new RegExp(`^${query}$`, 'i') },  // 精确匹配符号，忽略大小写
                { mint: new RegExp(`^${query}$`, 'i') }     // 精确匹配地址，忽略大小写
            ]
        };

        // 并行执行查询
        const [tokens, total] = await Promise.all([
            Token.find(searchQuery)
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Token.countDocuments(searchQuery)
        ]);

        // 调整时间为 UTC+8
        tokens.forEach(token => {
            token.timestamp = new Date(new Date(token.timestamp).getTime() + 4 * 60 * 60 * 1000);
        });

        res.json({
            tokens,
            total,
            page,
            pages: Math.ceil(total / limit)
        });
    } catch (error) {
        console.error('搜索失败:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
}); 