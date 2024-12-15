const { Connection, PublicKey } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const fs = require('fs');
const axios = require('axios');

// 配置信息
const ALCHEMY_RPC_URL = 'https://solana-mainnet.g.alchemy.com/v2/i884GrfNEyUVfSZlzr4qPxAXM-I9IO5_';

// Metaplex Token Metadata Program ID
const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

// 已知代币映射
const KNOWN_TOKENS = {
    'So11111111111111111111111111111111111111112': { symbol: 'SOL', name: 'Wrapped SOL' },
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { symbol: 'USDC', name: 'USD Coin' },
    // 添加其他已知代币
};

// 要监控的地址列表
const MONITOR_ADDRESSES = [
    'CH7MJuK5Kh2e7cribybdQLPzSxLqL4AgWwKZgaNoHA7J'
];

// 重试配置
const RETRY_CONFIG = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000
};

// 工具函数：延迟执行
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 工具函数：带重试的异步操作
async function withRetry(operation, retryCount = 0) {
    try {
        return await operation();
    } catch (error) {
        if (retryCount >= RETRY_CONFIG.maxRetries) {
            throw error;
        }

        const delay = Math.min(
            RETRY_CONFIG.baseDelay * Math.pow(2, retryCount),
            RETRY_CONFIG.maxDelay
        );

        console.log(`操作失败，${delay}ms 后重试 (${retryCount + 1}/${RETRY_CONFIG.maxRetries})...`);
        await sleep(delay);
        return withRetry(operation, retryCount + 1);
    }
}

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

// 格式化SOL数量
function formatSol(lamports) {
    return (lamports / 1000000000).toFixed(4) + ' SOL';
}

// 格式化时间戳
function formatTimestamp(timestamp) {
    return new Date(timestamp * 1000).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
}

// 解析错误信息
function parseError(err) {
    if (!err) return '成功';
    if (err.InstructionError) {
        const [index, error] = err.InstructionError;
        if (error.Custom === 40) {
            return `指令${index}失败: 滑点容差错误`;
        }
        return `指令${index}失败: ${JSON.stringify(error)}`;
    }
    return JSON.stringify(err);
}

// 解析交易方向和代币变化
async function parseTokenChanges(transaction, walletAddress) {
    if (!transaction?.meta?.preTokenBalances || !transaction?.meta?.postTokenBalances) {
        return [];
    }

    const changes = new Map();
    
    // 记录交易前的余额
    transaction.meta.preTokenBalances.forEach(pre => {
        if (pre.owner === walletAddress) {
            changes.set(pre.mint, {
                preAmount: pre.uiTokenAmount.uiAmount || 0,
                postAmount: pre.uiTokenAmount.uiAmount || 0,
                mint: pre.mint
            });
        }
    });

    // 记录交易后的余额
    transaction.meta.postTokenBalances.forEach(post => {
        if (post.owner === walletAddress) {
            const change = changes.get(post.mint) || {
                preAmount: 0,
                postAmount: 0,
                mint: post.mint
            };
            change.postAmount = post.uiTokenAmount.uiAmount || 0;
            changes.set(post.mint, change);
        }
    });

    // 计算SOL变化
    const preBalances = transaction.meta.preBalances;
    const postBalances = transaction.meta.postBalances;
    const solChange = (postBalances[0] - preBalances[0]) / 1000000000; // 转换为SOL单位

    // 计算变化并确定方向
    const tokenChanges = [];
    for (const [mint, change] of changes.entries()) {
        const diff = change.postAmount - change.preAmount;
        if (diff !== 0) {
            tokenChanges.push({
                mint,
                direction: diff > 0 ? '买入' : '卖出',
                amount: Math.abs(diff),
                solAmount: Math.abs(solChange) // 添加SOL变化量
            });
        }
    }

    return tokenChanges;
}

class WalletAnalyzer {
    constructor(connection, walletAddress) {
        this.connection = connection;
        this.walletAddress = walletAddress;
        this.publicKey = new PublicKey(walletAddress);
        this.transactionHistory = new Set(); // 用于存储已处理的交易
        this.tokenMetadata = new Map(); // 存储代币元数据

        // 创建日志文件
        this.logStream = fs.createWriteStream(`wallet_${walletAddress}_monitor.log`, { flags: 'a' });
    }

    // 记录日志
    log(message) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}]`);
        console.log(message);
        this.logStream.write(`[${timestamp}]\n${message}\n`);
    }

    // 从mint址解析代币符号
    parseSymbolFromMint(mintAddress) {
        // 如果地址以pump结尾
        if (mintAddress.toLowerCase().endsWith('pump')) {
            return 'PUMP';
        }
        return mintAddress.slice(0, 8) + '...';
    }

    // 通过RPC获取代币信息
    async getMintInfoViaRPC(mintAddress) {
        try {
            const response = await axios.post(ALCHEMY_RPC_URL, {
                jsonrpc: '2.0',
                id: 1,
                method: 'getAccountInfo',
                params: [
                    mintAddress,
                    {
                        encoding: 'jsonParsed'
                    }
                ]
            });

            console.log('RPC Response:', JSON.stringify(response.data, null, 2));

            if (response.data.result?.value?.data?.parsed?.type === 'mint') {
                const mintData = response.data.result.value.data.parsed.info;
                return mintData;
            }
            return null;
        } catch (error) {
            console.error('RPC调用失败:', error);
            return null;
        }
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
            const mintResponse = await axios.post(ALCHEMY_RPC_URL, {
                jsonrpc: '2.0',
                id: 1,
                method: 'getAccountInfo',
                params: [
                    mintAddress,
                    { encoding: 'jsonParsed' }
                ]
            });

            const mintInfo = mintResponse.data.result?.value?.data?.parsed?.info;

            // 2. 获取元数据账户地址
            const metadataAddress = await getMetadataAddress(mintAddress);

            // 3. 获取元数据账户信息
            const metadataResponse = await axios.post(ALCHEMY_RPC_URL, {
                jsonrpc: '2.0',
                id: 1,
                method: 'getAccountInfo',
                params: [
                    metadataAddress.toString(),
                    { encoding: 'base64' }
                ]
            });

            let symbol = '';
            let name = '';

            // 4. 解析元数据
            if (metadataResponse.data.result?.value?.data) {
                const buffer = Buffer.from(metadataResponse.data.result.value.data[0], 'base64');

                try {
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

                    console.log('解析结果:', { name, symbol });
                } catch (error) {
                    console.warn('解析元数据时出错:', error);
                }
            }

            // 如果没有获取到元数据，使用默认值
            if (!symbol || !name) {
                if (mintAddress.toLowerCase().endsWith('pump')) {
                    symbol = 'PUMP';
                    name = 'PUMP Token';
                } else {
                    symbol = mintAddress.slice(0, 8) + '...';
                    name = symbol;
                }
            }

            const tokenInfo = {
                mint: mintAddress,
                symbol,
                name,
                decimals: mintInfo?.decimals || 0,
                supply: mintInfo?.supply || '0',
                mintAuthority: mintInfo?.mintAuthority || null,
                freezeAuthority: mintInfo?.freezeAuthority || null
            };

            this.tokenMetadata.set(mintAddress, tokenInfo);
            return tokenInfo;

        } catch (error) {
            console.warn(`获取代币 ${mintAddress} 元数据失败:`, error);
            const symbol = this.parseSymbolFromMint(mintAddress);
            return {
                mint: mintAddress,
                symbol,
                name: symbol
            };
        }
    }

    // 解析交易类型
    async parseTransactionType(transaction) {
        if (!transaction || !transaction.meta) return { type: 'unknown', details: {} };

        // 检查是否是 Raydium 或其他 DEX 的 swap 交易
        const isSwapTransaction = transaction.meta.logMessages?.some(log =>
            log.toLowerCase().includes('swap') ||
            log.includes('raydium') ||
            log.includes('swapBasein')
        );

        if (!isSwapTransaction) {
            return { type: 'unknown', details: {} };
        }

        const preTokenBalances = transaction.meta.preTokenBalances || [];
        const postTokenBalances = transaction.meta.postTokenBalances || [];

        // 分析代币余额变化
        const changes = new Map();

        // 记录交易前的余额
        preTokenBalances.forEach(pre => {
            if (pre.owner === this.walletAddress) {
                changes.set(pre.mint, -(pre.uiTokenAmount.uiAmount || 0));
            }
        });

        // 记录交易后的余额变化
        postTokenBalances.forEach(post => {
            if (post.owner === this.walletAddress) {
                const currentChange = changes.get(post.mint) || 0;
                changes.set(post.mint, currentChange + (post.uiTokenAmount.uiAmount || 0));
            }
        });

        // 分析余额变化
        const positiveChanges = Array.from(changes.entries()).filter(([_, change]) => change > 0);
        const negativeChanges = Array.from(changes.entries()).filter(([_, change]) => change < 0);

        // 如果有代币余额减少和增加，就认为是 swap 交易
        if (positiveChanges.length > 0 && negativeChanges.length > 0) {
            // 获取代币元数据
            const soldTokens = await Promise.all(negativeChanges.map(async ([mint, amount]) => {
                const metadata = await this.getTokenMetadata(mint);
                return {
                    ...metadata,
                    amount: Math.abs(amount)
                };
            }));

            const boughtTokens = await Promise.all(positiveChanges.map(async ([mint, amount]) => {
                const metadata = await this.getTokenMetadata(mint);
                return {
                    ...metadata,
                    amount
                };
            }));

            // 输出调试信息
            console.log('交易日志:', transaction.meta.logMessages);
            console.log('代币余额变化:', {
                pre: preTokenBalances,
                post: postTokenBalances,
                changes: Object.fromEntries(changes)
            });

            return {
                type: 'swap',
                details: {
                    sold: soldTokens,
                    bought: boughtTokens
                }
            };
        }

        return { type: 'unknown', details: {} };
    }

    // 获取交易历史
    async getTransactionHistory() {
        try {
            const signatures = await withRetry(() =>
                this.connection.getSignaturesForAddress(
                    this.publicKey,
                    {
                        limit: 20,
                        commitment: 'confirmed'
                    }
                )
            );

            const newTransactions = signatures.filter(sig => !this.transactionHistory.has(sig.signature));

            if (newTransactions.length === 0) {
                return [];
            }

            const transactions = await Promise.all(
                newTransactions.map(async (sig) => {
                    try {
                        const tx = await withRetry(() =>
                            this.connection.getTransaction(sig.signature, {
                                maxSupportedTransactionVersion: 0,
                                commitment: 'confirmed'
                            })
                        );

                        if (!tx) {
                            console.log('无法获取交易详情:', sig.signature);
                            return null;
                        }

                        // 记录已处理的交易
                        this.transactionHistory.add(sig.signature);

                        // 解析代币变化
                        const tokenChanges = await parseTokenChanges(tx, this.walletAddress);

                        // 获取每个代币的详细信息
                        const tokenDetails = await Promise.all(
                            tokenChanges.map(async (change) => {
                                const tokenInfo = await this.getTokenMetadata(change.mint);
                                return {
                                    walletAddress: this.walletAddress,
                                    tokenSymbol: tokenInfo.symbol || change.mint.slice(0, 8) + '...',
                                    tokenName: tokenInfo.name || 'Unknown Token',
                                    tokenAddress: change.mint,
                                    direction: change.direction,
                                    amount: change.amount,
                                    solAmount: change.solAmount,
                                    status: sig.err ? '失败' : '成功',
                                    timestamp: sig.blockTime * 1000, // 转换为毫秒
                                    signature: sig.signature,
                                    error: sig.err ? parseError(sig.err) : null
                                };
                            })
                        );

                        return tokenDetails;
                    } catch (error) {
                        console.error('处理交易失败:', sig.signature, error);
                        return null;
                    }
                })
            );

            // 展平数组并过滤掉空值
            return transactions
                .filter(tx => tx !== null)
                .flat();
        } catch (error) {
            console.error('获取交易历史失败:', error);
            throw error;
        }
    }

    // 格式化交易信息
    formatTransactionInfo(tx) {
        return `
钱包地址：${tx.walletAddress}
代币符号：${tx.tokenSymbol}
代币名称：${tx.tokenName}
代币地址：${tx.tokenAddress}
交易方向：${tx.direction}
交易数量：${tx.amount}
sol数量：${tx.direction === '买入' ? '-' : '+'}${tx.solAmount.toFixed(4)} SOL
交易状态：${tx.status}${tx.error ? ' (' + tx.error + ')' : ''}
时间戳：${formatTimestamp(tx.timestamp / 1000)}
交易签名：${tx.signature}
-------------------`;
    }
    // 监控账户变化
    async startMonitoring(duration = 60000) {
        try {
            const pollInterval = 2000; // 2秒检查一次
            const intervalId = setInterval(async () => {
                try {
                    // 检查新交易
                    const newTransactions = await this.getTransactionHistory();
                    for (const tx of newTransactions) {
                        this.log(this.formatTransactionInfo(tx));
                    }
                } catch (error) {
                    console.error('监控出错:', error);
                }
            }, pollInterval);

            // 设置定时器来停止监控
            if (duration > 0) {
                setTimeout(() => {
                    clearInterval(intervalId);
                    this.logStream.end();
                }, duration);
            }

            // 返回取消监控的函数
            return () => {
                clearInterval(intervalId);
                this.logStream.end();
            };
        } catch (error) {
            console.error('启动监控失败:', error);
            this.logStream.end();
            throw error;
        }
    }
}

class MultiWalletMonitor {
    constructor(connection) {
        this.connection = connection;
        this.analyzers = new Map();
        this.logStream = fs.createWriteStream(`multi_wallet_monitor.log`, { flags: 'a' });
    }

    // 记录日志
    log(message) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}]`);
        console.log(message);
        this.logStream.write(`[${timestamp}]\n${message}\n`);
    }

    // 添加要监控的钱包
    addWallet(address) {
        if (!this.analyzers.has(address)) {
            const analyzer = new WalletAnalyzer(this.connection, address);
            this.analyzers.set(address, analyzer);
        }
    }

    // 开始监控所有钱包
    async startMonitoring() {
        const pollInterval = 2000; // 2秒检查一次
        const intervalId = setInterval(async () => {
            try {
                // 并行检查所有钱包的新交易
                await Promise.all(Array.from(this.analyzers.values()).map(async (analyzer) => {
                    const newTransactions = await analyzer.getTransactionHistory();
                    for (const tx of newTransactions) {
                        this.log(analyzer.formatTransactionInfo(tx));
                    }
                }));
            } catch (error) {
                console.error('监控出错:', error);
            }
        }, pollInterval);

        // 返回停止监控的函数
        return () => {
            clearInterval(intervalId);
            this.logStream.end();
            // 关闭所有分析器的日志流
            for (const analyzer of this.analyzers.values()) {
                analyzer.logStream.end();
            }
        };
    }
}

// 修改测试用例为多地址监控模式
async function runTest() {
    try {
        const connection = new Connection(ALCHEMY_RPC_URL, {
            commitment: 'confirmed',
            confirmTransactionInitialTimeout: 60000
        });

        // 创建多钱包监控器
        const monitor = new MultiWalletMonitor(connection);

        // 添加要监控的地址
        for (const address of MONITOR_ADDRESSES) {
            monitor.addWallet(address);
        }

        // 开始监控
        const stopMonitoring = await monitor.startMonitoring();

        // 监听用户输入以手动停止
        process.stdin.on('data', (data) => {
            if (data.toString().trim().toLowerCase() === 'stop') {
                stopMonitoring();
                process.exit(0);
            }
        });

    } catch (error) {
        console.error('监控过程中出错:', error);
        process.exit(1);
    }
}

// 运行监控
runTest(); 