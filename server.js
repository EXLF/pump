const express = require('express');
const apiKeysRouter = require('./routes/apiKeys');
const { connectDB, Token, ApiKey, AddressAlias } = require('./models/db');
const cors = require('cors');
const NodeCache = require('node-cache');
const cache = new NodeCache({ 
    stdTTL: 5,
    checkperiod: 10,
    maxKeys: 1000,
    useClones: false // 禁用克隆以提高性能
}); // 5秒缓存
const { initializeWebSocket } = require('./websocket');

// 初始化数据库连接
connectDB();

// 使用 Map 存储用户IP和最后活跃时间
const activeUsers = new Map();
const TIMEOUT = 5 * 60 * 1000; // 5分钟超时
const BASE_ONLINE_USERS = 0; // 基础在线人数

// 定期清理过期用户
setInterval(() => {
    const now = Date.now();
    for (const [ip, lastActive] of activeUsers) {
        if (now - lastActive > TIMEOUT) {
            activeUsers.delete(ip);
        }
    }
}, 10 * 1000); // 每10秒检查一次

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.use(express.json());
app.use('/api/keys', apiKeysRouter);
app.use('/admin', express.static('public/admin'));

// 中间件
app.use((req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    activeUsers.set(clientIP, Date.now());
    next();
});

// 添加缓存中间件
const cacheMiddleware = (duration) => (req, res, next) => {
    const key = `__express__${req.originalUrl}`;
    const cachedResponse = cache.get(key);

    if (cachedResponse) {
        res.json(cachedResponse);
        return;
    }

    res.originalJson = res.json;
    res.json = (body) => {
        cache.set(key, body, duration);
        res.originalJson(body);
    };
    next();
};

// API接口
app.get('/api/online-users', (req, res) => {
    // 清理过期用户
    const now = Date.now();
    for (const [ip, lastActive] of activeUsers) {
        if (now - lastActive > TIMEOUT) {
            activeUsers.delete(ip);
        }
    }
    
    res.json({ 
        onlineUsers: BASE_ONLINE_USERS + activeUsers.size, // 加上基础在线人数
        lastUpdate: new Date().toISOString()
    });
});

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
app.get('/api/tokens', cacheMiddleware(30), async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const duplicatesOnly = req.query.duplicatesOnly === 'true';
        const groupNumber = req.query.groupNumber ? parseInt(req.query.groupNumber) : null;
        
        // 修改缓存键，加入组号
        const cacheKey = `tokens_page_${page}_${duplicatesOnly}_${groupNumber || 'all'}`;
        
        // 检查缓存
        const cachedData = cache.get(cacheKey);
        if (cachedData) {
            return res.json(cachedData);
        }

        const limit = 9;
        const skip = (page - 1) * limit;

        // 构建查询条件
        let query = {};
        if (groupNumber !== null) {
            query.duplicateGroup = groupNumber;
        } else if (duplicatesOnly) {
            query.duplicateGroup = { $ne: null };
        }

        // 使用投影减少返回的字段
        const projection = {
            mint: 1,
            signer: 1,
            name: 1,
            symbol: 1,
            timestamp: 1,
            duplicateGroup: 1,
            duplicateType: 1,
            'metadata.uri': 1,
            'metadata.image': 1,
            'metadata.twitter': 1
        };

        // 并行执行查询
        const [tokens, total] = await Promise.all([
            Token.find(query)
                .select(projection)
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Token.countDocuments(query)
        ]);

        // 调整时间为 UTC+8
        tokens.forEach(token => {
            token.timestamp = new Date(new Date(token.timestamp).getTime());
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
        console.error('查询失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 获取重复代币列表
app.get('/api/duplicate-tokens', async (req, res) => {
    try {
        const { query } = req.query;
        const cacheKey = query ? `duplicate_tokens_search_${query}` : 'duplicate_tokens';
        
        // 构建基础查询条
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
        
        // 过滤掉只有一个代币的组
        const groupCounts = {};
        matchingTokens.forEach(token => {
            groupCounts[token.duplicateGroup] = (groupCounts[token.duplicateGroup] || 0) + 1;
        });
        
        const validGroups = Object.entries(groupCounts)
            .filter(([_, count]) => count > 1)
            .map(([group]) => parseInt(group));

        // 只返回有多个代币的组
        const duplicateGroups = validGroups;

        const duplicateTokensInfo = await Promise.all(duplicateGroups.map(async (groupNumber) => {
            const tokens = await Token.find({ duplicateGroup: groupNumber })
                .sort({ timestamp: -1 })
                .lean();

            if (tokens.length < 2) return null; // 跳过只有一个代币的组

            // 获取最新和最早的时间戳，并统一加4小时调整时区
            const latestTime = new Date(tokens[0].timestamp).getTime();
            const previousTime = tokens[1]?.timestamp 
                ? new Date(tokens[1].timestamp).getTime() 
                : null;
            const firstTime = new Date(tokens[tokens.length - 1].timestamp).getTime();

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

        // 过滤掉空值并返回结果
        const filteredResults = duplicateTokensInfo.filter(info => info !== null);
        
        res.json(filteredResults);
    } catch (error) {
        console.error('获取重复代币失败:', error);
        res.status(500).json({ error: error.message });
    }
});



// 修改特定重复组的获取端点，添加分页支持
app.get('/api/duplicate-group-tokens/:groupNumber', async (req, res) => {
    try {
        const groupNumber = parseInt(req.params.groupNumber);
        const page = parseInt(req.query.page) || 1;
        const limit = 9; // 每页显示9条记录
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

        // 所有代币、重复代币 调整时间为 UTC+8
        tokens.forEach(token => {
            token.timestamp = new Date(new Date(token.timestamp).getTime());
        });

        // 回分页数据
        const result = {
            tokens,
            total,
            page,
            pages: Math.ceil(total / limit)
        };

        res.json(result);
    } catch (error) {
        console.error('获取重复组币失败:', error);
        res.status(500).json({ error: error.message });
    }
});

app.use(express.json());
app.use('/api/keys', apiKeysRouter);
app.use('/admin', express.static('public/admin'));


// 新增搜索接口
app.get('/api/tokens/search', async (req, res) => {
    try {
        const { query } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = 9;
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
            token.timestamp = new Date(new Date(token.timestamp).getTime());
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

// 每8小时更新一次duplicateGroup字段最多的值为null
setInterval(async () => {
    try {
        const result = await Token.aggregate([
            { $match: { duplicateGroup: { $ne: null } } },
            { $group: { _id: "$duplicateGroup", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 1 }
        ]);

        if (result.length > 0) {
            const mostFrequentGroup = result[0]._id;
            await Token.updateMany(
                { duplicateGroup: mostFrequentGroup },
                { $set: { duplicateGroup: null } }
            );
            console.log(`重置了组 ${mostFrequentGroup} 的 duplicateGroup 字段`);
        }
    } catch (error) {
        console.error('更新 duplicateGroup 失败:', error);
    }
}, 8 * 60 * 60 * 1000); // 每8小时执行一次

// 获取所有地址别名
app.get('/api/address-aliases', async (req, res) => {
    try {
        const aliases = await AddressAlias.find().lean();
        console.log('查询到的地址别名:', aliases);
        res.json(aliases);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 添加或更新地址别名
app.post('/api/address-aliases', async (req, res) => {
    try {
        const { address, alias } = req.body;
        const result = await AddressAlias.findOneAndUpdate(
            { address },
            { alias },
            { upsert: true, new: true }
        );
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 修改 Dev 代币列表接口
app.get('/api/dev-tokens', cacheMiddleware(10), async (req, res) => { // 只缓存10秒
    try {
        const aliases = await AddressAlias.find().lean();
        if (aliases.length === 0) {
            return res.json([]);
        }
        
        const devAddresses = aliases.map(a => a.address);
        
        // 只获取最近1小时内的代币
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        
        const tokens = await Token.find({
            signer: { $in: devAddresses },
            timestamp: { $gte: oneHourAgo }
        })
        .sort({ timestamp: -1 })
        .lean();

        const tokensWithAliases = tokens.map(token => ({
            ...token,
            signerAlias: aliases.find(a => a.address === token.signer)?.alias || null,
            timestamp: new Date(token.timestamp)
        }));

        res.json(tokensWithAliases);
    } catch (error) {
        console.error('获取 Dev 代币失败:', error);
        res.status(500).json({ error: error.message });
    }
});

const server = app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
});

// 初始化 WebSocket
initializeWebSocket(server); 