const express = require('express');
const apiKeysRouter = require('./src/api/routes/apiKeys');
const walletRoutes = require('./src/api/routes/walletRoutes');
const { connectDB, Token, ApiKey, AddressAlias } = require('./src/models/db');
const cors = require('cors');
const NodeCache = require('node-cache');
const cache = new NodeCache({ 
    stdTTL: 3,
    checkperiod: 10,
    maxKeys: 1000,
    useClones: false // 禁用克隆以提高性能
}); // 3秒缓存
const { initializeWebSocket } = require('./src/services/websocket/websocket');
const WebSocket = require('ws');
const TokenDataManager = require('./src/services/token/TokenDataManager');
const { router: adminRouter, updateVisitStats } = require('./src/api/routes/adminRoutes');
const { testCollection } = require('./src/models/visitStats');
const walletService = require('./src/services/walletService');

// 初始化数据库连接
connectDB().then(async () => {
    console.log('MongoDB连接成功');
    
    // 测试访问统计集合
    await testCollection();
    
    // 初始化 TokenDataManager
    const tokenManager = new TokenDataManager();
    console.log('Token监控服务已启动');

    // 初始化钱包监控服务
    await walletService.initialize();
    console.log('钱包监控服务已启动');
}).catch(err => {
    console.error('MongoDB连接失败:', err);
});

// 使用 Map 存储用户连接信息
const activeUsers = new Map();
global.wsConnections = new Map(); // 使用全局变量存储WebSocket连接
const TIMEOUT = 5 * 60 * 1000; // 5分钟超时
const HEARTBEAT_INTERVAL = 30 * 1000; // 30秒心跳间隔
const HEARTBEAT_TIMEOUT = 35 * 1000; // 35秒心跳超时

// WebSocket 心跳检测
function setupHeartbeat(ws, clientId) {
    ws.isAlive = true;
    ws.on('pong', () => {
        ws.isAlive = true;
    });

    // 发送心跳
    const heartbeat = setInterval(() => {
        if (!ws.isAlive) {
            clearInterval(heartbeat);
            global.wsConnections.delete(clientId);
            updateOnlineCount();
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    }, HEARTBEAT_INTERVAL);

    // 连接关闭时清理
    ws.on('close', () => {
        clearInterval(heartbeat);
        global.wsConnections.delete(clientId);
        updateOnlineCount();
    });
}

// 更新在线人数
function updateOnlineCount() {
    const count = global.wsConnections.size;
    // 广播更新
    global.wsConnections.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'onlineCount',
                data: count
            }));
        }
    });
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 使用管理路由
app.use('/admin', adminRouter);

// 使用钱包监控路由
app.use('/api', walletRoutes);

// 记录访问统计的中间件
app.use((req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    updateVisitStats(ip, userAgent);
    next();
});

// 中间件
app.use((req, res, next) => {
    const clientId = getClientId(req);
    const now = Date.now();
    
    // 获取或创建用户数据
    let userData = global.activeUsers.get(clientId) || {
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        firstSeen: now,
        lastActive: now,
        visitCount: 0
    };
    
    // 更新用户数据
    userData.lastActive = now;
    userData.visitCount++;
    
    global.activeUsers.set(clientId, userData);
    next();
});

// 创建两级缓存
const shortCache = new NodeCache({ 
    stdTTL: 2,  // 2秒的短期缓存
    checkperiod: 1,
    maxKeys: 1000,
    useClones: false
});

const longCache = new NodeCache({ 
    stdTTL: 10,  // 10秒的长期缓存
    checkperiod: 5,
    maxKeys: 1000,
    useClones: false
});

// 优化的缓存中间件
const cacheMiddleware = (duration) => (req, res, next) => {
    const key = `__express__${req.originalUrl}`;
    const cachedResponse = longCache.get(key);

    if (cachedResponse) {
        return res.json(cachedResponse);
    }

    const originalJson = res.json;
    res.json = function(body) {
        longCache.set(key, body, duration);
        return originalJson.call(this, body);
    };
    next();
};

// API接口
app.get('/api/online-users', (req, res) => {
    const now = Date.now();
    let activeCount = 0;
    
    // 清理并统计活跃用户
    for (const [clientId, lastActive] of activeUsers) {
        if (now - lastActive <= TIMEOUT) {
            activeCount++;
        } else {
            activeUsers.delete(clientId);
            const ws = global.wsConnections.get(clientId);
            if (ws) {
                ws.terminate();
                global.wsConnections.delete(clientId);
            }
        }
    }
    
    res.json({ 
        onlineUsers: Math.max(global.wsConnections.size, activeCount),
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

// 获取代币列表 - 使用分层缓存
app.get('/api/tokens', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const duplicatesOnly = req.query.duplicatesOnly === 'true';
        const groupNumber = req.query.groupNumber ? parseInt(req.query.groupNumber) : null;
        
        // 构建缓存键
        const cacheKey = `tokens_${page}_${duplicatesOnly}_${groupNumber || 'all'}`;
        
        // 检查缓存
        let result = cache.get(cacheKey);
        if (result) {
            return res.json(result);
        }

        // 构建查询条件
        const query = {};
        if (groupNumber !== null) {
            // 如果指定了组号，只返回该组的代币
            query.duplicateGroup = groupNumber;
        } else if (duplicatesOnly) {
            // 如果只看重复的，返回所有有重复组号的代币
            query.duplicateGroup = { $ne: null };
        }

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
            'metadata.twitter': 1,
            'metadata.website': 1,
            'metadata.telegram': 1,
            'metadata.discord': 1,
            'metadata.medium': 1,
            'metadata.github': 1
        };

        // 并行执行查询
        const [tokens, total] = await Promise.all([
            Token.find(query)
                .select(projection)
                .sort({ timestamp: -1 })
                .skip((page - 1) * 9)
                .limit(9)
                .lean(),
            Token.countDocuments(query)
        ]);

        // 调整时间为 UTC+8
        tokens.forEach(token => {
            token.timestamp = new Date(token.timestamp);
        });

        result = {
            tokens,
            total,
            pages: Math.ceil(total / 9),
            currentPage: page
        };

        // 设置缓存
        cache.set(cacheKey, result);

        res.json(result);
    } catch (error) {
        console.error('获取代币列表失败:', error);
        res.status(500).json({ error: '获取代币列表失败' });
    }
});

// 获取重复代币列表
app.get('/api/duplicate-tokens', async (req, res) => {
    try {
        const { query, groupNumber } = req.query;
        const cacheKey = `duplicate_tokens_${query || ''}_${groupNumber || ''}`;
        
        // 构建基础查询条件
        let baseQuery = { duplicateGroup: { $ne: null } };
        
        // 如果指定了组号，只返回该组的代币
        if (groupNumber) {
            baseQuery.duplicateGroup = parseInt(groupNumber);
        }
        
        // 如果有搜索查询，添加搜索条件
        if (query) {
            baseQuery = {
                ...baseQuery,
                $or: [
                    { symbol: new RegExp(query, 'i') },
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

            // 获取最新和最早的时戳
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



// 特定重复的获取端点，添加分页支持
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
        console.error('获取重复币失败:', error);
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
                { symbol: new RegExp(`^${query}$`, 'i') },  // 精确匹配符号，忽略小写
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

// 每8小时更新一次duplicateGroup字段最多的为null
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
        
        // 只取最近1小时内的代币
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

// 获取客户端ID
function getClientId(req) {
    const ip = req.headers['x-forwarded-for'] || 
               req.connection.remoteAddress || 
               req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return `${ip}-${userAgent}`;
}

// 扩展用户连接信息存储
global.activeUsers = new Map();
global.TIMEOUT = 5 * 60 * 1000; // 5分钟超时

// 启动服务器
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
});

// 配置WebSocket服务器
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
    const clientId = getClientId(req);
    global.wsConnections.set(clientId, ws);
    setupHeartbeat(ws, clientId);
    updateOnlineCount();

    // 发送初始在线人数
    ws.send(JSON.stringify({
        type: 'onlineCount',
        data: global.wsConnections.size
    }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'heartbeat') {
                ws.isAlive = true;
                activeUsers.set(clientId, Date.now());
            }
        } catch (error) {
            console.error('WebSocket 消息处理错误:', error);
        }
    });
}); 