const axios = require('axios');

const BITQUERY_API_URL = 'https://streaming.bitquery.io/eap';
const BITQUERY_BEARER_TOKEN = 'ory_at_6YJ_vOT2rgc5vW4LVEhOxwT-IXmN1R7L67BpTMscdFc.DmkFwCFhqC8XlhnA15N9ouqfmMe1NTfYZJEFWFZuDU0';

async function getHoldersCount(mintAddress) {
    try {
        const query = `
            query MyQuery {
                Solana {
                    BalanceUpdates(
                        orderBy: {descendingByField: "BalanceUpdate_Holding_maximum"}
                        where: {BalanceUpdate: {Currency: {MintAddress: {is: "${mintAddress}"}}}, Transaction: {Result: {Success: true}}}
                    ) {
                        BalanceUpdate {
                            Currency {
                                MintAddress
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
            variables: {}
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${BITQUERY_BEARER_TOKEN}`
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
        return 0;
    }
}

module.exports = {
    getHoldersCount
}; 