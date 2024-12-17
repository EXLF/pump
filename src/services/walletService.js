const { Connection, PublicKey } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const { WalletConfig, Transaction } = require('../models/walletModel');

// Metaplex Token Metadata Program ID
const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

// 已知代币映射
const KNOWN_TOKENS = {
    'So11111111111111111111111111111111111111112': { symbol: 'SOL', name: 'Wrapped SOL' },
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { symbol: 'USDC', name: 'USD Coin' },
    // 可以添加更多已知代币
};

// RPC配置
const RPC_CONFIG = {
    endpoint: 'https://solana-mainnet.g.alchemy.com/v2/i884GrfNEyUVfSZlzr4qPxAXM-I9IO5_',
    commitment: 'confirmed',
    timeout: 60000
};

// 监控配置
const MONITOR_CONFIG = {
    pollInterval: 5000,  // 轮询间隔为5秒
    maxRetries: 3,       // 最大重试次数
    batchSize: 20        // 每批处理交易数改为20个
};

// 获取元数据账户地址
async function getMetadataAddress(mintAddress) {
    const [metadataAddress] = await PublicKey.findProgramAddress(
        [
            Buffer.from('metadata'),
            METADATA_PROGRAM_ID.toBuffer(),
            new PublicKey(mintAddress).toBuffer()
        ],
        METADATA_PROGRAM_ID
    );
    return metadataAddress;
}

class WalletService {
    constructor() {
        this.connection = new Connection(RPC_CONFIG.endpoint, {
            commitment: RPC_CONFIG.commitment,
            confirmTransactionInitialTimeout: RPC_CONFIG.timeout
        });
        this.monitors = new Map();
        this.tokenMetadata = new Map();
    }

    // 初始化监控服务
    async initialize() {
        try {
            // 测试RPC连接
            const version = await this.connection.getVersion();
            console.log('RPC连接成功，版本:', version);

            // 加载所有活的钱包配置
            const activeWallets = await WalletConfig.find({ isActive: true });
            console.log(`找到 ${activeWallets.length} 个活跃钱包配置`);

            for (const wallet of activeWallets) {
                await this.startMonitoring(wallet);
            }
            console.log(`已初始化 ${activeWallets.length} 个钱包的监控`);
        } catch (error) {
            console.error('初始化钱包监控服务失败:', error);
            throw error;
        }
    }

    // 启动单个钱包监控
    async startMonitoring(walletConfig) {
        if (this.monitors.has(walletConfig.walletAddress)) {
            console.log(`钱包 ${walletConfig.walletAddress} 已在监控中`);
            return;
        }

        console.log(`开始监控钱包: ${walletConfig.walletAddress}`);
        
        // 获取初始交易记录
        try {
            const publicKey = new PublicKey(walletConfig.walletAddress);
            const signatures = await this.connection.getSignaturesForAddress(
                publicKey,
                { limit: 1 }
            );
            
            const monitor = {
                config: walletConfig,
                lastSignature: signatures.length > 0 ? signatures[0].signature : null,
                interval: setInterval(async () => {
                    try {
                        await this.checkNewTransactions(walletConfig);
                    } catch (error) {
                        console.error(`检查钱包 ${walletConfig.walletAddress} 的交易失败:`, error);
                    }
                }, MONITOR_CONFIG.pollInterval)
            };

            this.monitors.set(walletConfig.walletAddress, monitor);
            console.log(`钱包 ${walletConfig.walletAddress} 监控已启动，初始签名: ${monitor.lastSignature}`);
        } catch (error) {
            console.error(`启动钱包 ${walletConfig.walletAddress} 监控失败:`, error);
            throw error;
        }
    }

    // 停止监控
    stopMonitoring(walletAddress) {
        const monitor = this.monitors.get(walletAddress);
        if (monitor) {
            clearInterval(monitor.interval);
            this.monitors.delete(walletAddress);
            console.log(`停止监控钱包: ${walletAddress}`);
        }
    }

    // 检查新交易
    async checkNewTransactions(walletConfig) {
        try {
            // 获取最新的钱包配置
            const latestConfig = await WalletConfig.findOne({ walletAddress: walletConfig.walletAddress });
            if (!latestConfig || !latestConfig.isActive) {
                console.log(`钱包 ${walletConfig.walletAddress} 已停止监控`);
                this.stopMonitoring(walletConfig.walletAddress);
                return;
            }
            walletConfig = latestConfig;

            const publicKey = new PublicKey(walletConfig.walletAddress);
            const monitor = this.monitors.get(walletConfig.walletAddress);

            console.log(`检查钱包 ${walletConfig.walletAddress} 的新交易...`);

            // 获取最新的交易签名
            const signatures = await this.connection.getSignaturesForAddress(
                publicKey,
                { limit: MONITOR_CONFIG.batchSize }
            );

            // 如果没有新交易，直接返回
            if (signatures.length === 0) {
                console.log(`钱包 ${walletConfig.walletAddress} 没有新交易`);
                return;
            }

            console.log(`获取到 ${signatures.length} 个签名`);

            // 如果是首次检查，只记录最新的签名
            if (!monitor.lastSignature) {
                monitor.lastSignature = signatures[0].signature;
                console.log(`首次检查，记录最新签名: ${monitor.lastSignature}`);
                return;
            }

            // 找到上次检查的位置
            const lastIndex = signatures.findIndex(sig => sig.signature === monitor.lastSignature);
            if (lastIndex === -1) {
                // 如果找不到上次的签名，可能错过了一些交易，从最新的开始
                monitor.lastSignature = signatures[0].signature;
                console.log(`未找到上次的签名，从最新的开始: ${monitor.lastSignature}`);
                return;
            }

            // 处理新交易
            const newSignatures = signatures.slice(0, lastIndex);
            console.log(`发现 ${newSignatures.length} 个新交易`);

            // 处理每个新交易
            for (const sig of newSignatures) {
                try {
                    const transactions = await this.analyzeTransaction(sig.signature, walletConfig);
                    if (transactions && transactions.length > 0) {
                        console.log(`交易 ${sig.signature} 包含 ${transactions.length} 个代币变化`);
                        
                        // 保存所有交易记录
                        const savedTransactions = await this.saveTransaction(transactions);
                        if (savedTransactions && savedTransactions.length > 0) {
                            console.log(`成功保存 ${savedTransactions.length} 条交易记录`);
                            // 输出详细信息用于调试
                            savedTransactions.forEach(tx => {
                                console.log(`- ${tx.direction} ${tx.amount} ${tx.tokenSymbol} (${tx.tokenName})`);
                            });
                        }
                    }
                } catch (error) {
                    console.error(`处理交易 ${sig.signature} 时出错:`, error);
                    continue; // 继续处理下一个交易
                }
            }

            // 更新最后检查的签名
            monitor.lastSignature = signatures[0].signature;
            
            // 更新钱包配置的最后检查时间
            await WalletConfig.updateOne(
                { walletAddress: walletConfig.walletAddress },
                { $set: { lastChecked: new Date() } }
            );

            console.log(`钱包 ${walletConfig.walletAddress} 检查完成`);

        } catch (error) {
            console.error(`检查钱包 ${walletConfig.walletAddress} 的新交易失败:`, error);
        }
    }

    // 分析交易
    async analyzeTransaction(signature, walletConfig) {
        try {
            const tx = await this.connection.getTransaction(signature, {
                maxSupportedTransactionVersion: 0
            });

            if (!tx || !tx.meta) return null;

            // 分析SOL变化
            const preBalances = tx.meta.preBalances;
            const postBalances = tx.meta.postBalances;
            const solChange = (postBalances[0] - preBalances[0]) / 1000000000; // 转换为SOL单位

            // 分析代币变化
            const tokenChanges = await this.analyzeTokenChanges(tx, walletConfig);
            if (!tokenChanges || tokenChanges.length === 0) return null;

            // 返回所有代币变化的交易记录
            return tokenChanges.map(change => ({
                walletAddress: walletConfig.walletAddress,
                tokenSymbol: change.tokenSymbol,
                tokenName: change.tokenName || 'Unknown Token',
                tokenAddress: change.tokenAddress,
                direction: change.direction,
                amount: Math.abs(change.amount),
                solAmount: solChange / tokenChanges.length, // 平均分配 SOL 变化
                status: tx.meta.err ? '失败' : '成功',
                timestamp: new Date(tx.blockTime * 1000),
                signature
            }));

        } catch (error) {
            console.error(`分析交易 ${signature} 失败:`, error);
            return null;
        }
    }

    // 分析代币变化
    async analyzeTokenChanges(tx, walletConfig) {
        if (!tx.meta?.preTokenBalances || !tx.meta?.postTokenBalances) {
            console.log('没有代币余额变化信息');
            return null;
        }

        console.log('开始分析代币变化...');
        console.log('交易前余额:', JSON.stringify(tx.meta.preTokenBalances, null, 2));
        console.log('交易后余额:', JSON.stringify(tx.meta.postTokenBalances, null, 2));

        const changes = new Map();
        
        // 首先记录所有涉及的代币
        const allMints = new Set([
            ...tx.meta.preTokenBalances.map(pre => pre.mint),
            ...tx.meta.postTokenBalances.map(post => post.mint)
        ]);

        // 为所有涉及的代币初始化变化记录
        for (const mint of allMints) {
            changes.set(mint, {
                preAmount: 0,
                postAmount: 0,
                mint: mint
            });
        }
        
        // 记录交易前的余额
        tx.meta.preTokenBalances.forEach(pre => {
            console.log(`检查交易前余额 - 代币: ${pre.mint}, 所有者: ${pre.owner}`);
            if (pre.owner === walletConfig.walletAddress) {
                const change = changes.get(pre.mint);
                if (change) {
                    change.preAmount = pre.uiTokenAmount.uiAmount || 0;
                    console.log(`记录交易前余额 - 代币: ${pre.mint}, 金额: ${change.preAmount}`);
                }
            }
        });

        // 记录交易后的余额
        tx.meta.postTokenBalances.forEach(post => {
            console.log(`检查交易后余额 - 代币: ${post.mint}, 所有者: ${post.owner}`);
            if (post.owner === walletConfig.walletAddress) {
                const change = changes.get(post.mint);
                if (change) {
                    change.postAmount = post.uiTokenAmount.uiAmount || 0;
                    console.log(`记录交易后余额 - 代币: ${post.mint}, 金额: ${change.postAmount}`);
                }
            }
        });

        // 分析所有变化
        const tokenChanges = [];
        console.log('分析余额变化...');
        for (const [mint, change] of changes.entries()) {
            const diff = change.postAmount - change.preAmount;
            console.log(`代币 ${mint} 的变化:`, {
                preAmount: change.preAmount,
                postAmount: change.postAmount,
                diff: diff
            });

            if (diff !== 0) {
                const direction = diff > 0 ? '买入' : '卖出';
                console.log(`检测到${direction}操作 - 代币: ${mint}, 数量: ${Math.abs(diff)}`);
                
                // 根据配置过滤交易方向
                if ((direction === '买入' && !walletConfig.monitorBuy) ||
                    (direction === '卖出' && !walletConfig.monitorSell)) {
                    console.log(`跳过${direction}操作 - 未开启监控`);
                    continue;
                }

                const tokenInfo = await this.getTokenMetadata(mint);
                console.log('获取到代币信息:', tokenInfo);

                tokenChanges.push({
                    tokenSymbol: tokenInfo.symbol,
                    tokenName: tokenInfo.name,
                    tokenAddress: mint,
                    direction,
                    amount: Math.abs(diff)
                });
                console.log(`添加交易记录: ${direction} ${Math.abs(diff)} ${tokenInfo.symbol}`);
            }
        }

        // 检查最终结果
        console.log(`分析完成，找到 ${tokenChanges.length} 个代币变化:`, 
            JSON.stringify(tokenChanges, null, 2));

        return tokenChanges;
    }

    // 获取代币元数据
    async getTokenMetadata(mintAddress) {
        try {
            // 如果已经有缓存的元数据，直接返回
            if (this.tokenMetadata.has(mintAddress)) {
                return this.tokenMetadata.get(mintAddress);
            }

            // 检查是否是已知代币
            if (KNOWN_TOKENS[mintAddress]) {
                const tokenInfo = {
                    mint: mintAddress,
                    ...KNOWN_TOKENS[mintAddress]
                };
                this.tokenMetadata.set(mintAddress, tokenInfo);
                return tokenInfo;
            }

            // 1. 先获取基本的mint信息
            const mintInfo = await this.connection.getParsedAccountInfo(new PublicKey(mintAddress));
            
            // 2. 获取元数据账户地址
            const metadataAddress = await getMetadataAddress(mintAddress);

            // 3. 获取元数据账户信息
            const metadataInfo = await this.connection.getAccountInfo(metadataAddress);

            let symbol = '';
            let name = '';

            // 4. 解析元数据
            if (metadataInfo?.data) {
                try {
                    const buffer = metadataInfo.data;

                    // 跳过key和authority
                    let offset = 1 + 32 + 32;

                    // 读取name
                    const nameLength = buffer.readUInt32LE(offset);
                    offset += 4;
                    if (nameLength > 0 && nameLength < 100) {
                        name = buffer.slice(offset, offset + nameLength).toString('utf8').replace(/\0/g, '');
                    }
                    offset += 32; // 跳到symbol部分

                    // 读取symbol
                    const symbolLength = buffer.readUInt32LE(offset);
                    offset += 4;
                    if (symbolLength > 0 && symbolLength < 100) {
                        symbol = buffer.slice(offset, offset + symbolLength).toString('utf8').replace(/\0/g, '');
                    }
                } catch (error) {
                    console.warn('解析元数据时出错:', error);
                }
            }

            // 如果没有获取到元数据，使用默认值或mint信息
            if (!symbol || !name) {
                const mintData = mintInfo.value?.data?.parsed?.info;
                symbol = mintData?.symbol || (mintAddress.toLowerCase().endsWith('pump') ? 'PUMP' : mintAddress.slice(0, 8) + '...');
                name = mintData?.name || symbol;
            }

            const tokenInfo = {
                mint: mintAddress,
                symbol,
                name,
                decimals: mintInfo.value?.data?.parsed?.info?.decimals || 0
            };

            this.tokenMetadata.set(mintAddress, tokenInfo);
            return tokenInfo;

        } catch (error) {
            console.warn(`获取代币 ${mintAddress} 元数据失败:`, error);
            // 使用简单的回退值
            const fallbackInfo = {
                mint: mintAddress,
                symbol: mintAddress.toLowerCase().endsWith('pump') ? 'PUMP' : mintAddress.slice(0, 8) + '...',
                name: 'Unknown Token'
            };
            this.tokenMetadata.set(mintAddress, fallbackInfo);
            return fallbackInfo;
        }
    }

    // 保存交易记录
    async saveTransaction(transactionData) {
        try {
            // 如果是数组，则保存多个交易记录
            if (Array.isArray(transactionData)) {
                const results = await Promise.all(
                    transactionData.map(async (data) => {
                        try {
                            const transaction = new Transaction(data);
                            await transaction.save();
                            console.log(`保存交易记录成功: ${transaction.signature}`);
                            return transaction;
                        } catch (error) {
                            if (error.code === 11000) {
                                console.log(`交易记录已存在: ${data.signature}`);
                                return null;
                            }
                            throw error;
                        }
                    })
                );
                return results.filter(result => result !== null);
            } else {
                // 处理单个交易记录
                const transaction = new Transaction(transactionData);
                await transaction.save();
                console.log(`保存交易记录成功: ${transaction.signature}`);
                return transaction;
            }
        } catch (error) {
            if (error.code === 11000) { // 重复键错误
                console.log(`交易记录已存在: ${transactionData.signature}`);
                return null;
            }
            console.error('保存交易记录失败:', error);
            throw error;
        }
    }
}

// 创建单例实例
const walletService = new WalletService();

module.exports = walletService; 