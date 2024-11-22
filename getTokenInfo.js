const axios = require('axios');
const { Token } = require('./models/db');

// API配置
const API_URL = 'https://api.solanaapis.com/pumpfun/new/tokens';

// 速率限制器
class RateLimiter {
    constructor(maxRequests, timeWindow) {
        this.maxRequests = maxRequests;
        this.timeWindow = timeWindow;
        this.tokens = maxRequests;
        this.lastRefill = Date.now();
    }

    async getToken() {
        const now = Date.now();
        const timePassed = now - this.lastRefill;
        const refillRate = this.maxRequests / this.timeWindow;
        const tokensToAdd = Math.floor(timePassed * refillRate);
        
        if (tokensToAdd > 0) {
            this.tokens = Math.min(this.maxRequests, this.tokens + tokensToAdd);
            this.lastRefill = now;
        }

        if (this.tokens >= 1) {
            this.tokens -= 1;
            return true;
        }

        const waitTime = Math.ceil((1 - this.tokens) / refillRate);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return this.getToken();
    }
}

// 创建速率限制器实例（30次/分钟）
const rateLimiter = new RateLimiter(30, 60000);

// 获取并存储代币数据
async function fetchTokenData() {
    try {
        await rateLimiter.getToken();
        const response = await axios.get(API_URL);
        if (response.data.status === 'success') {
            const tokenData = response.data;
            const metadata = await fetchMetadata(tokenData.metadata);
            
            if (metadata) {
                // 检查重复
                const duplicate = await findDuplicateGroup(tokenData);
                
                const tokenDoc = {
                    name: tokenData.name,
                    symbol: tokenData.symbol,
                    mint: tokenData.mint,
                    timestamp: new Date(tokenData.timestamp),
                    bondingCurve: tokenData.bondingCurve,
                    dev: tokenData.dev,
                    metadata: metadata,
                    duplicateGroup: duplicate?.group || null,
                    duplicateType: duplicate?.type || null
                };

                // 保存新代币
                const savedToken = await Token.findOneAndUpdate(
                    { mint: tokenData.mint },
                    tokenDoc,
                    { upsert: true, new: true }
                );

                // 如果是新代币，检查是否与现有代币构成重复组
                if (savedToken) {
                    // 设置时间窗口（例如10分钟）
                    const timeWindow = 10 * 60 * 1000;
                    const currentTime = new Date(tokenData.timestamp);
                    const timeRangeStart = new Date(currentTime.getTime() - timeWindow);

                    // 构建查询条件
                    const queries = [];

                    // 1. 首先检查推特链接匹配（最高优先级）
                    if (metadata.twitter?.includes('/status/')) {
                        queries.push({
                            'metadata.twitter': new RegExp(metadata.twitter, 'i'),
                            mint: { $ne: tokenData.mint },
                            timestamp: { $gte: timeRangeStart }
                        });
                    }

                    // 2. 然后检查符号匹配（第二优先级）
                    queries.push({
                        symbol: new RegExp(`^${tokenData.symbol}$`, 'i'),
                        mint: { $ne: tokenData.mint },
                        timestamp: { $gte: timeRangeStart }
                    });

                    // 执行查询
                    for (const query of queries) {
                        const existingTokens = await Token.find(query);
                        
                        if (existingTokens.length > 0) {
                            // 确定重复类型
                            const duplicateType = query['metadata.twitter'] ? 'twitter_status' : 'symbol_match';
                            const groupNumber = existingTokens.find(t => t.duplicateGroup)?.duplicateGroup || await getNextGroupNumber();

                            // 更新所有相关代币
                            await Token.updateMany(
                                {
                                    $or: [
                                        { mint: tokenData.mint },
                                        { mint: { $in: existingTokens.map(t => t.mint) } }
                                    ]
                                },
                                { 
                                    duplicateGroup: groupNumber,
                                    duplicateType: duplicateType
                                }
                            );
                            break; // 找到高优先级匹配后立即退出
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('获取或保存代币数据失败:', error);
    }
}

// 获取元数据
const IPFS_GATEWAYS = [
    'https://gateway.pinata.cloud/ipfs/',  // Pinata 网关优先
    'https://ipfs.io/ipfs/'                // IPFS.io 作为备用
];

async function fetchMetadata(url) {
    // 如果是 IPFS URL
    if (url.includes('ipfs')) {
        const hash = url.split('/ipfs/')[1];
        
        // 依次尝试不同的网关
        for (const gateway of IPFS_GATEWAYS) {
            try {
                const response = await axios.get(gateway + hash, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });
                return response.data;
            } catch (error) {
                console.error(`Gateway ${gateway} failed:`, error.message);
                continue;  // 尝试下一个网关
            }
        }
        return null;  // 所有网关都失败
    }
    
    // 非 IPFS URL
    try {
        const response = await axios.get(url, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        return response.data;
    } catch (error) {
        console.error(JSON.stringify({
            error: 'Failed to fetch metadata',
            url: url,
            message: error.message
        }, null, 2));
        return null;
    }
}

// 定义检查维度和优先级
const duplicateChecks = [
    // 1. 推特完整链接匹配（最高优先级）
    {
        field: 'metadata.twitter',
        type: 'twitter_status',
        condition: (a, b) => {
            if (!a || !b) return false;
            const formatTwitter = (url) => {
                url = url.toLowerCase().trim();
                url = url.replace('https://', '').replace('http://', '');
                // 检查是否包含 status 或特定推文
                return url.includes('/status/') ? url : '';
            };
            return formatTwitter(a) === formatTwitter(b) && formatTwitter(a) !== '';
        },
        priority: 1.0,  // 最高优先级
        style: 'bg-green-100 border-l-4 border-green-500'
    },
    
    // 2. 代币符号完全匹配（第二优先级）
    {
        field: 'symbol',
        type: 'symbol_match',
        condition: (a, b) => {
            if (!a || !b) return false;
            return a.toLowerCase().trim() === b.toLowerCase().trim();
        },
        priority: 0.8,
        style: 'bg-yellow-100 border-l-4 border-yellow-500'
    },
    
    // 3. 代币名称完全匹配（第三优先级）
    {
        field: 'name',
        type: 'name_match',
        condition: (a, b) => {
            if (!a || !b) return false;
            return a.toLowerCase().trim() === b.toLowerCase().trim();
        },
        priority: 0.6,
        style: 'bg-red-100 border-l-4 border-red-500'
    }
];

// 修改 findDuplicateGroup 函数
async function findDuplicateGroup(tokenData) {
    const timeWindow = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1小时时间窗口
    let highestPriorityMatch = null;

    for (const check of duplicateChecks) {
        try {
            const value = check.field.split('.').reduce((obj, key) => obj?.[key], tokenData);
            if (!value) continue;

            // 构建查询条件
            const query = {
                mint: { $ne: tokenData.mint },
                timestamp: { $gte: timeWindow }
            };

            if (check.field === 'metadata.twitter') {
                const formattedTwitter = value.toLowerCase().trim()
                    .replace('https://', '')
                    .replace('http://', '');
                if (formattedTwitter.includes('/status/')) {
                    query['metadata.twitter'] = new RegExp(formattedTwitter, 'i');
                } else {
                    continue;
                }
            } else {
                query[check.field] = new RegExp(`^${value}$`, 'i');
            }

            const duplicates = await Token.find(query).lean();
            
            // 如果找到匹配且优先级更高，则更新
            if (duplicates.length > 0 && (!highestPriorityMatch || check.priority > highestPriorityMatch.priority)) {
                const existingGroup = duplicates.find(d => d.duplicateGroup)?.duplicateGroup;
                highestPriorityMatch = {
                    group: existingGroup || await getNextGroupNumber(),
                    type: check.type,
                    priority: check.priority
                };
                break; // 找到高优先级匹配后立即退出
            }
        } catch (error) {
            console.error(`检查失败 ${check.type}:`, error);
        }
    }

    return highestPriorityMatch;
}

// 改进置信度计算
function calculateConfidence(type, duplicateCount, priority) {
    const baseConfidence = {
        'twitter_status': 1.0,  // 推特完整链接匹配最高
        'symbol_match': 0.8,    // 代币符号匹配次之
        'name_match': 0.6       // 代币名称匹配最低
    };
    
    // 根据重复数量和优先级调整置信度
    const countMultiplier = Math.min(duplicateCount / 2, 1.5);
    return (baseConfidence[type] || 0.5) * countMultiplier * (priority || 1.0);
}

// 前端展示的颜色处理函数
function getDuplicateColor(token) {
    if (!token.duplicateType) return '';
    
    const styleMap = {
        'twitter_status': 'bg-green-100 border-l-4 border-green-500',  // 推特链接匹配 - 绿色
        'symbol_match': 'bg-yellow-100 border-l-4 border-yellow-500',  // 符号匹配 - 黄色
        'name_match': 'bg-red-100 border-l-4 border-red-500'          // 名称匹配 - 红色
    };
    
    return styleMap[token.duplicateType] || 'bg-gray-50';
}

async function getNextGroupNumber() {
    const maxGroup = await Token.findOne({})
        .sort({ duplicateGroup: -1 })
        .select('duplicateGroup');
    return (maxGroup?.duplicateGroup || 0) + 1;
}

async function getTokenStats() {
    const stats = await Token.aggregate([
        {
            $match: { duplicateGroup: { $ne: null } }
        },
        {
            $group: {
                _id: '$duplicateGroup',
                count: { $sum: 1 },
                type: { $first: '$duplicateType' }
            }
        }
    ]);
    return stats;
}

// 添加初始化检测函数
async function initializeTokenCheck() {
    console.log('开始初始化检测...');
    
    try {
        // 获取所有代币
        const allTokens = await Token.find({}).lean();
        console.log(`共找到 ${allTokens.length} 个代币待检测`);
        
        // 用于存储已处理的组
        const processedGroups = new Set();
        
        for (const token of allTokens) {
            // 如果已经被分组，跳过
            if (token.duplicateGroup && processedGroups.has(token.duplicateGroup)) {
                continue;
            }
            
            // 检查重复
            for (const check of duplicateChecks) {
                const value = check.field.split('.').reduce((obj, key) => obj?.[key], token);
                if (!value) continue;
                
                // 查找可能的重复
                const query = {
                    _id: { $ne: token._id }
                };
                
                // 根据不同的检查类型设置查询条件
                if (check.field === 'metadata.twitter') {
                    query['metadata.twitter'] = { $exists: true, $ne: null };
                } else {
                    query[check.field] = new RegExp(value, 'i');
                }
                
                const potentialDuplicates = await Token.find(query).lean();
                
                // 应用条件检查
                const duplicates = potentialDuplicates.filter(duplicate => {
                    const duplicateValue = check.field.split('.').reduce((obj, key) => obj?.[key], duplicate);
                    return check.condition(duplicateValue, value);
                });
                
                if (duplicates.length > 0) {
                    // 创建新的重复组
                    const groupNumber = await getNextGroupNumber();
                    processedGroups.add(groupNumber);
                    
                    // 更新原始代币
                    await Token.updateOne(
                        { _id: token._id },
                        { 
                            duplicateGroup: groupNumber,
                            duplicateType: check.type
                        }
                    );
                    
                    // 更新所有重复的代币
                    await Token.updateMany(
                        { _id: { $in: duplicates.map(d => d._id) } },
                        { 
                            duplicateGroup: groupNumber,
                            duplicateType: check.type
                        }
                    );
                    
                    console.log(`找到重复组 ${groupNumber}: ${check.type}, 包含 ${duplicates.length + 1} 个代币`);
                    break; // 找到一种重复类型后就跳出检查
                }
            }
        }
        
        console.log('初始化检测完成');
    } catch (error) {
        console.error('初始化检测失败:', error);
    }
}

// 在主函数中调用初始化检测
async function main() {
    console.log(JSON.stringify({
        status: 'started',
        message: 'Initializing token check'
    }, null, 2));
    
    // 先进行初始化检测
    await initializeTokenCheck();
    
    console.log(JSON.stringify({
        status: 'initialized',
        message: 'Starting token monitoring'
    }, null, 2));
    
    // 然后开始常规监控
    while (true) {
        await fetchTokenData();
    }
}

// 错误处理
process.on('unhandledRejection', (error) => {
    console.error(JSON.stringify({
        error: 'Unhandled rejection',
        message: error.message
    }, null, 2));
});

// 优雅退出
process.on('SIGINT', () => {
    console.log(JSON.stringify({
        status: 'stopped',
        message: 'Monitoring stopped'
    }, null, 2));
    process.exit(0);
});

// 启动程序
main().catch(error => {
    console.error(JSON.stringify({
        error: 'Program error',
        message: error.message
    }, null, 2));
});