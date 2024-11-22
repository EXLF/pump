const express = require('express');
const { Token } = require('./models/db');
const cors = require('cors');
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 10 }); // 10秒缓存

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 获取代币列表
app.get('/api/tokens', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const duplicatesOnly = req.query.duplicatesOnly === 'true';
        const cacheKey = `tokens_page_${page}_${duplicatesOnly}`;
        
        // 检查缓存
        const cachedData = cache.get(cacheKey);
        if (cachedData) {
            return res.json(cachedData);
        }

        const limit = 11;
        const skip = (page - 1) * limit;

        // 构建查询条件
        const query = duplicatesOnly ? { duplicateGroup: { $ne: null } } : {};

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

// 获取特定重复组的所有代币
app.get('/api/duplicate-group-tokens/:groupNumber', async (req, res) => {
    try {
        const groupNumber = parseInt(req.params.groupNumber);
        
        // 获取该组的所有代币
        const tokens = await Token.find({ 
            duplicateGroup: groupNumber 
        })
        .sort({ timestamp: -1 })
        .lean();

        // 调整时间为 UTC+8
        tokens.forEach(token => {
            token.timestamp = new Date(new Date(token.timestamp).getTime() + 8 * 60 * 60 * 1000);
        });

        // 返回分页所需的格式
        const result = {
            tokens,
            total: tokens.length,
            page: 1,
            pages: 1
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