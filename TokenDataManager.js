const { Token } = require('./models/db');
const { broadcastUpdate } = require('./websocket');
const BitqueryWebSocketClient = require('./BitqueryWebSocketClient');
const axios = require('axios');
const Queue = require('bull');

class TokenDataManager {
    constructor() {
        this.wsClient = null;
        this.lastProcessedTime = null;
        // 初始化队列
        this.tokenQueue = new Queue('tokenProcessing', {
            redis: {
                port: 6379,
                host: '127.0.0.1',
            },
            limiter: {
                max: 1000,
                duration: 5000
            }
        });

        // 设置队列处理器
        this.tokenQueue.process(async (job) => {
            return this.processQueuedData(job.data);
        });

        // 监听队列事件
        this.tokenQueue.on('completed', (job) => {
            console.log(`任务 ${job.id} 完成处理`);
        });

        this.tokenQueue.on('failed', (job, err) => {
            console.error(`任务 ${job.id} 失败:`, err);
        });

        this.tokenQueue.on('error', (error) => {
            console.error('队列错误:', error);
        });
    }

    initialize() {
        this.wsClient = new BitqueryWebSocketClient(this);
        this.wsClient.connect();
    }

    // WebSocket 数据接收处理
    async processWebSocketData(data) {
        try {
            // 将数据添加到队列
            await this.tokenQueue.add(data, {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 2000
                },
                removeOnComplete: true,
                removeOnFail: false
            });

            console.log("数据已添加到处理队列");
        } catch (error) {
            console.error("添加数据到队列失败:", error);
        }
    }

    // 队列数据处理
    async processQueuedData(data) {
        try {
            const instruction = data.Solana.Instructions[0];
            
            const tokenAccount = instruction.Instruction.Accounts.find(
                account => account.Token.Mint
            );
            const programArgs = instruction.Instruction.Program.Arguments;

            if (!tokenAccount) return;

            const nameArg = programArgs.find(arg => arg.Name === "name");
            const symbolArg = programArgs.find(arg => arg.Name === "symbol");
            const uriArg = programArgs.find(arg => arg.Name === "uri");

            const tokenData = {
                mint: tokenAccount.Token.Mint,
                owner: tokenAccount.Token.Owner,
                timestamp: new Date(instruction.Block.Time),
                name: nameArg?.Value.string,
                symbol: symbolArg?.Value.string,
                metadata: {
                    uri: uriArg?.Value.string
                }
            };

            // 获取元数据
            if (tokenData.metadata.uri) {
                try {
                    const metadataResponse = await axios.get(tokenData.metadata.uri, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                    });
                    const metadata = metadataResponse.data;
                    
                    tokenData.metadata = {
                        ...tokenData.metadata,
                        description: metadata.description,
                        image: metadata.image,
                        showName: metadata.showName,
                        createdOn: metadata.createdOn,
                        twitter: metadata.twitter,
                        website: metadata.website,
                        telegram: metadata.telegram
                    };

                    // 检查重复
                    const duplicate = await this.findDuplicateGroup(tokenData);
                    if (duplicate) {
                        tokenData.duplicateGroup = duplicate.group;
                        tokenData.duplicateType = duplicate.type;
                    }
                } catch (metadataError) {
                    console.error("获取元数据失败:", metadataError.message);
                }
            }

            // 打印处理的数据
            console.log("处理队列数据:");
            console.log("Time:", tokenData.timestamp);
            console.log("Mint:", tokenData.mint);
            console.log("Symbol:", tokenData.symbol);
            console.log("Duplicate Group:", tokenData.duplicateGroup);
            console.log("--------------------------------------------------");

            // 保存到数据库
            const savedToken = await Token.findOneAndUpdate(
                { mint: tokenData.mint },
                tokenData,
                { upsert: true, new: true }
            );

            if (savedToken) {
                const latestTokens = await Token.find()
                    .sort({ timestamp: -1 })
                    .limit(11)
                    .lean();

                broadcastUpdate({
                    type: 'tokensUpdate',
                    data: latestTokens
                });

                // 更新重复组
                if (tokenData.metadata.twitter?.includes('/status/') || tokenData.symbol) {
                    await this.updateDuplicateGroups(tokenData);
                }
            }

            return savedToken;

        } catch (error) {
            console.error("处理队列数据失败:", error);
            throw error;
        }
    }

    // 定义重复检查的优先级规则
    static duplicateChecks = [
        {
            type: 'twitter_status',
            priority: 100,  // 最高优先级
            field: 'metadata.twitter',
            validate: (value) => value?.includes('/status/'),
            match: async (tokenData, timeWindow) => {
                if (!tokenData.metadata?.twitter?.includes('/status/')) return null;
                
                const match = await Token.findOne({
                    'metadata.twitter': new RegExp(tokenData.metadata.twitter, 'i'),
                    mint: { $ne: tokenData.mint },
                    timestamp: { $gte: timeWindow }
                });
                
                return match;
            }
        },
        {
            type: 'symbol_match',
            priority: 50,   // 次高优先级
            field: 'symbol',
            validate: (value) => value?.length > 0,
            match: async (tokenData, timeWindow) => {
                if (!tokenData.symbol) return null;
                
                const match = await Token.findOne({
                    symbol: new RegExp(`^${tokenData.symbol}$`, 'i'),
                    mint: { $ne: tokenData.mint },
                    timestamp: { $gte: timeWindow }
                });
                
                return match;
            }
        },
        {
            type: 'name_match',
            priority: 25,   // 最低优先级
            field: 'name',
            validate: (value) => value?.length > 0,
            match: async (tokenData, timeWindow) => {
                if (!tokenData.name) return null;
                
                const match = await Token.findOne({
                    name: new RegExp(`^${tokenData.name}$`, 'i'),
                    mint: { $ne: tokenData.mint },
                    timestamp: { $gte: timeWindow }
                });
                
                return match;
            }
        }
    ];

    // 查找重复组
    async findDuplicateGroup(tokenData) {
        const timeWindow = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1小时时间窗口
        let highestPriorityMatch = null;

        // 按优先级顺序检查每种重复类型
        for (const check of TokenDataManager.duplicateChecks) {
            try {
                // 验证字段值是否有效
                const value = check.field.split('.').reduce((obj, key) => obj?.[key], tokenData);
                if (!check.validate(value)) continue;

                // 查找匹配
                const match = await check.match(tokenData, timeWindow);
                
                if (match?.duplicateGroup) {
                    // 如果找到更高优先级的匹配，更新结果
                    if (!highestPriorityMatch || check.priority > highestPriorityMatch.priority) {
                        highestPriorityMatch = {
                            group: match.duplicateGroup,
                            type: check.type,
                            priority: check.priority
                        };
                        break; // 找到高优先级匹配后立即退出
                    }
                }
            } catch (error) {
                console.error(`检查失败 ${check.type}:`, error);
                // 继续检查其他类型
            }
        }

        return highestPriorityMatch;
    }

    // 更新重复组
    async updateDuplicateGroups(tokenData) {
        const timeWindow = new Date(Date.now() - 1 * 60 * 60 * 1000);
        let updated = false;

        // 按优先级顺序检查和更新
        for (const check of TokenDataManager.duplicateChecks) {
            try {
                const value = check.field.split('.').reduce((obj, key) => obj?.[key], tokenData);
                if (!check.validate(value)) continue;

                const match = await check.match(tokenData, timeWindow);
                
                if (match) {
                    const groupNumber = match.duplicateGroup || await this.getNextGroupNumber();
                    
                    // 更新所有相关代币
                    await Token.updateMany(
                        {
                            $or: [
                                { mint: tokenData.mint },
                                { mint: match.mint }
                            ]
                        },
                        { 
                            duplicateGroup: groupNumber,
                            duplicateType: check.type
                        }
                    );
                    
                    updated = true;
                    break; // 找到并更新后立即退出
                }
            } catch (error) {
                console.error(`更新失败 ${check.type}:`, error);
            }
        }

        return updated;
    }

    // 获取重复组统计信息
    async getDuplicateStats() {
        try {
            const stats = await Token.aggregate([
                {
                    $match: { 
                        duplicateGroup: { $ne: null }
                    }
                },
                {
                    $group: {
                        _id: {
                            group: '$duplicateGroup',
                            type: '$duplicateType'
                        },
                        count: { $sum: 1 },
                        tokens: { $push: '$$ROOT' }
                    }
                },
                {
                    $sort: { 
                        '_id.type': -1,  // 按类型排序
                        'count': -1      // 按数量降序
                    }
                }
            ]);

            return stats;
        } catch (error) {
            console.error('获取重复组统计失败:', error);
            return [];
        }
    }

    async getNextGroupNumber() {
        const maxGroup = await Token.findOne()
            .sort({ duplicateGroup: -1 })
            .select('duplicateGroup');
        return (maxGroup?.duplicateGroup || 0) + 1;
    }
}

module.exports = TokenDataManager; 