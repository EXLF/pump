const axios = require('axios');
const { ApiKey } = require('../../models/db');

const BITQUERY_API_URL = 'https://streaming.bitquery.io/eap';

async function getHoldersCount(mintAddress) {
    try {
        // 从数据库获取活跃的 API key
        const apiKey = await ApiKey.findOne({ isActive: true }).select('key');
        if (!apiKey) {
            throw new Error('No active API key found');
        }

        const query = `
            query MyQuery {
                Solana {
                    BalanceUpdates(
                        orderBy: {descendingByField: "BalanceUpdate_Holding_maximum"}
                        where: {BalanceUpdate: {Currency: {MintAddress: {is: "${mintAddress}"}}}, Transaction: {Result: {Success: true}}}
                    ) {
                        BalanceUpdate {
                            Currency {
                                Name
                                MintAddress
                                Symbol
                            }
                            Account {
                                Address
                            }
                            Holding: PostBalance(maximum: Block_Slot)
                        }
                    }
                }
            }
        `;

        const response = await axios.post(BITQUERY_API_URL, {
            query,
            variables: "{}"
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey.key}`  // 使用 Bearer Token 认证
            }
        });

        const balanceUpdates = response.data?.data?.Solana?.BalanceUpdates || [];
        
        // 计算持有者数量（Holding > 0 的账户数量）
        const holdersCount = balanceUpdates.filter(update => 
            parseFloat(update.BalanceUpdate.Holding) > 0
        ).length;

        // 计算唯一地址数量
        const uniqueAddresses = new Set(
            balanceUpdates.map(update => update.BalanceUpdate.Account.Address)
        ).size;

        // 返回较大的数值
        return Math.max(holdersCount, uniqueAddresses);
    } catch (error) {
        console.error('获取持币人数据失败:', error);
        throw error; // 向上抛出错误，以便调用者知道具体失败原因
    }
}

module.exports = {
    getHoldersCount
}; 