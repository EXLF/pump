const { Connection, PublicKey } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');

async function analyzeWallet() {
    const connection = new Connection('https://solana-mainnet.g.alchemy.com/v2/i884GrfNEyUVfSZlzr4qPxAXM-I9IO5_', {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 60000
    });
    const address = new PublicKey('CH7MJuK5Kh2e7cribybdQLPzSxLqL4AgWwKZgaNoHA7J');

    try {
        console.log('开始分析钱包特征...\n');

        // 1. 获取账户基本信息
        console.log('1. 账户基本信息:');
        const accountInfo = await connection.getAccountInfo(address);
        console.log(`账户余额: ${accountInfo.lamports / 1000000000} SOL`);
        console.log(`账户类型: ${accountInfo.executable ? '程序账户' : '普通账户'}`);
        console.log(`账户所有者: ${accountInfo.owner.toString()}`);
        console.log(`账户大小: ${accountInfo.data.length} 字节`);

        // 2. 获取代币账户
        console.log('\n2. 代币账户信息:');
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(address, {
            programId: TOKEN_PROGRAM_ID
        });
        console.log(`持有代币账户数量: ${tokenAccounts.value.length}`);
        for (const account of tokenAccounts.value) {
            const tokenInfo = account.account.data.parsed.info;
            if (tokenInfo.tokenAmount.uiAmount > 0) {
                console.log(`- 代币: ${tokenInfo.mint}`);
                console.log(`  余额: ${tokenInfo.tokenAmount.uiAmount}`);
            }
        }

        // 3. 分析最近交易
        console.log('\n3. 交易分析:');
        const signatures = await connection.getSignaturesForAddress(address, { limit: 100 });
        
        // 计算交易时间间隔
        let intervals = [];
        for (let i = 1; i < signatures.length; i++) {
            intervals.push(signatures[i-1].blockTime - signatures[i].blockTime);
        }
        
        const averageInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const minInterval = Math.min(...intervals);
        const maxInterval = Math.max(...intervals);

        console.log(`最近100笔交易分析:`);
        console.log(`- 平均交易间隔: ${averageInterval.toFixed(2)} 秒`);
        console.log(`- 最短交易间隔: ${minInterval} 秒`);
        console.log(`- 最长交易间隔: ${maxInterval} 秒`);

        // 分析交易状态
        const successCount = signatures.filter(sig => !sig.err).length;
        const failCount = signatures.filter(sig => sig.err).length;
        console.log(`- 成功交易: ${successCount}`);
        console.log(`- 失败交易: ${failCount}`);
        console.log(`- 成功率: ${((successCount / signatures.length) * 100).toFixed(2)}%`);

        // 4. 获取最近一笔交易的详细信息作为样本
        console.log('\n4. 最近交易示例分析:');
        if (signatures.length > 0) {
            const recentTx = await connection.getTransaction(signatures[0].signature, {
                maxSupportedTransactionVersion: 0
            });

            if (recentTx) {
                // 分析程序调用
                const programs = new Set();
                recentTx.transaction.message.accountKeys.forEach(key => {
                    programs.add(key.toString());
                });

                console.log('调用的程序:');
                programs.forEach(program => {
                    console.log(`- ${program}`);
                });

                // 分析指令数量
                console.log(`指令数量: ${recentTx.transaction.message.instructions.length}`);

                // 分析日志信息
                if (recentTx.meta?.logMessages) {
                    console.log('\n交易日志关键信息:');
                    recentTx.meta.logMessages.forEach(log => {
                        if (log.includes('invoke') || log.includes('success') || log.includes('failed')) {
                            console.log(log);
                        }
                    });
                }
            }
        }

        // 5. 特征总结
        console.log('\n5. 特征总结:');
        const isBot = averageInterval < 5 || minInterval < 2; // 如果平均间隔小于5秒或最小间隔小于2秒，可能是机器人
        const isHighFrequency = signatures.length === 100 && maxInterval < 60; // 如果100笔交易都在60秒内，则为高频交易
        
        console.log(`1. 交易频率: ${isHighFrequency ? '异常高频' : '正常'}`);
        console.log(`2. 交易模式: ${isBot ? '疑似机器人' : '可能是普通用户'}`);
        console.log(`3. 账户特征: ${accountInfo.executable ? '程序账户' : '普通钱包账户'}`);
        console.log(`4. 交易成功率: ${((successCount / signatures.length) * 100).toFixed(2)}%`);
        
        if (isBot) {
            console.log('\n⚠️ 警告：该地址具有明显的机器人特征：');
            console.log('- 交易间隔过短');
            console.log('- 交易频率异常');
            console.log('- 大量失败交易');
            console.log('建议进行进一步监控和分析');
        }

    } catch (error) {
        console.error('分析过程中出错:', error);
    }
}

console.log('开始分析钱包...\n');
analyzeWallet(); 