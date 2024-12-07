const Queue = require('bull');
const { Token } = require('../models/db');
const { broadcastUpdate } = require('../websocket');
const axios = require('axios');

// 创建队列实例
const tokenQueue = new Queue('tokenProcessing', {
    redis: {
        port: 6379,
        host: '127.0.0.1',
        // password: 'your-redis-password' // 如果有密码
    },
    limiter: {
        max: 1000, // 最大并发处理数
        duration: 5000 // 时间窗口（毫秒）
    }
});

// 处理队列中的数据
tokenQueue.process(async (job) => {
    try {
        const data = job.data;
        const instruction = data.Solana.Instructions[0];
        
        // 提取代币数据
        const tokenAccount = instruction.Instruction.Accounts.find(
            account => account.Token.Mint
        );
        const programArgs = instruction.Instruction.Program.Arguments;
        const signer = instruction.Transaction.Signer;

        if (!tokenAccount) return;

        // 提取基础数据
        const nameArg = programArgs.find(arg => arg.Name === "name");
        const symbolArg = programArgs.find(arg => arg.Name === "symbol");
        const uriArg = programArgs.find(arg => arg.Name === "uri");

        const tokenData = {
            mint: tokenAccount.Token.Mint,
            signer: signer,
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
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'
                    }
                });
                const metadata = metadataResponse.data;
                
                // 合并元数据
                tokenData.metadata = {
                    ...tokenData.metadata,
                    description: metadata.description,
                    image: metadata.image,
                    showName: metadata.showName,
                    createdOn: metadata.createdOn,
                    twitter: metadata.twitter,
                    website: metadata.website,
                    discord: metadata.discord,
                    telegram: metadata.telegram,
                    medium: metadata.medium,
                    github: metadata.github,
                    attributes: metadata.attributes,
                    collection: metadata.collection,
                    external_url: metadata.external_url
                };
            } catch (metadataError) {
                console.error("获取元数据失败:", metadataError.message);
            }
        }

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
        }

        // 打印处理信息
        console.log(`处理完成: ${tokenData.mint}`);
        return savedToken;

    } catch (error) {
        console.error("队列处理失败:", error);
        throw error; // 重新抛出错误以便 Bull 可以处理重试
    }
});

// 监听队列事件
tokenQueue.on('completed', (job) => {
    console.log(`Job ${job.id} 完成处理`);
});

tokenQueue.on('failed', (job, err) => {
    console.error(`Job ${job.id} 失败:`, err);
});

tokenQueue.on('error', (error) => {
    console.error('队列错误:', error);
});

module.exports = tokenQueue; 