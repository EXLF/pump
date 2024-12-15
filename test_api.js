const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';
const TEST_WALLET = 'BQtu3yAXTcoSTKoq7ymeT1KuHV4asartq1maDap788FX';

// 等待指定的毫秒数
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function testAPIs() {
    try {
        console.log('开始测试 API...\n');

        // 0. 先删除可能存在的钱包
        console.log('0. 删除已存在的钱包:');
        try {
            const deleteResponse = await axios.delete(`${BASE_URL}/wallets/${TEST_WALLET}`);
            console.log('删除钱包响应:', deleteResponse.data);
        } catch (error) {
            console.log('钱包不存在或已被删除');
        }
        console.log('----------------------------------------\n');

        // 1. 测试添加钱包
        console.log('1. 测试添加钱包:');
        const addWalletResponse = await axios.post(`${BASE_URL}/wallets`, {
            walletAddress: TEST_WALLET,
            walletName: '测试钱包1',
            monitorBuy: true,
            monitorSell: true
        });
        console.log('添加钱包响应:', addWalletResponse.data);
        console.log('----------------------------------------\n');

        // 等待一段时间，让服务有机会获取和处理交易数据
        console.log('等待60秒，让服务获取交易数据...');
        for (let i = 0; i < 12; i++) {
            await sleep(5000);
            process.stdout.write('.');
        }
        console.log('\n');

        // 2. 测试获取钱包列表，检查lastChecked字段是否更新
        console.log('2. 测试获取钱包列表:');
        const getWalletsResponse = await axios.get(`${BASE_URL}/wallets`);
        console.log('钱包列表:', getWalletsResponse.data);
        
        // 检查lastChecked是否已更新
        const wallet = getWalletsResponse.data.data.find(w => w.walletAddress === TEST_WALLET);
        if (wallet && wallet.lastChecked) {
            console.log('钱包最后检查时间已更新:', new Date(wallet.lastChecked));
        } else {
            console.log('警告: 钱包最后检查时间未更新');
        }
        console.log('----------------------------------------\n');

        // 3. 测试更新钱包配置
        console.log('3. 测试更新钱包配置:');
        const updateWalletResponse = await axios.put(`${BASE_URL}/wallets/${TEST_WALLET}`, {
            walletName: '测试钱包1-更新',
            monitorBuy: true,
            monitorSell: false
        });
        console.log('更新钱包响应:', updateWalletResponse.data);
        console.log('----------------------------------------\n');

        // 4. 测试获取钱包交易历史
        console.log('4. 测试获取钱包交易历史:');
        const getTransactionsResponse = await axios.get(`${BASE_URL}/wallets/${TEST_WALLET}/transactions`);
        console.log('交易历史:', getTransactionsResponse.data);
        
        // 检查是否成功获取到交易数据
        const transactions = getTransactionsResponse.data.data.transactions;
        if (transactions.length > 0) {
            console.log(`成功获取到 ${transactions.length} 条交易记录`);
            console.log('最新的交易:', transactions[0]);
        } else {
            console.log('警告: 未获取到任何交易记录');
            
            // 获取RPC状态以诊断问题
            try {
                const rpcResponse = await axios.get(`${BASE_URL}/wallets/${TEST_WALLET}/rpc-status`);
                console.log('RPC连接状态:', rpcResponse.data);
            } catch (error) {
                console.log('无法获取RPC状态');
            }
        }
        console.log('----------------------------------------\n');

        // 5. 测试获取钱包统计信息
        console.log('5. 测试获取钱包统计信息:');
        const getStatsResponse = await axios.get(`${BASE_URL}/wallets/${TEST_WALLET}/stats`);
        console.log('统计信息:', getStatsResponse.data);
        
        // 检查统计数据是否正确
        const stats = getStatsResponse.data.data;
        if (stats.totalTransactions > 0) {
            console.log('交易统计:');
            console.log(`- 总交易数: ${stats.totalTransactions}`);
            console.log(`- 买入次数: ${stats.buyCount}`);
            console.log(`- 卖出次数: ${stats.sellCount}`);
            console.log(`- 成功次数: ${stats.successCount}`);
            console.log(`- 失败次数: ${stats.failCount}`);
            console.log(`- 总SOL金额: ${stats.totalSolAmount}`);
        } else {
            console.log('警告: 未获取到任何统计数据');
        }
        console.log('----------------------------------------\n');

        console.log('所有 API 测试完成！');

    } catch (error) {
        console.error('测试过程中出错:', error.response ? error.response.data : error.message);
    }
}

testAPIs(); 