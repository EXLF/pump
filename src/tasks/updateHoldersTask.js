const { Token } = require('../models/db');
const { getHoldersCount } = require('../services/holders/holdersService');

async function updateHoldersCount() {
    try {
        // 获取最近24小时内创建的代币和最近被查看的代币
        const timeThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const updateThreshold = new Date(Date.now() - 30 * 60 * 1000); // 30分钟前

        const tokensToUpdate = await Token.find({
            $or: [
                { timestamp: { $gte: timeThreshold } }, // 最近24小时创建的
                { lastHoldersUpdate: { $lte: updateThreshold } } // 30分钟未更新的
            ]
        }).select('mint').limit(100); // 每次最多更新100个代币

        console.log(`开始更新${tokensToUpdate.length}个代币的持币人数据`);

        // 并发更新，但限制并发数
        const batchSize = 5; // 每批次处理5个
        for (let i = 0; i < tokensToUpdate.length; i += batchSize) {
            const batch = tokensToUpdate.slice(i, i + batchSize);
            await Promise.all(batch.map(async (token) => {
                try {
                    const holdersCount = await getHoldersCount(token.mint);
                    await Token.findOneAndUpdate(
                        { mint: token.mint },
                        { 
                            holdersCount,
                            lastHoldersUpdate: new Date()
                        }
                    );
                    console.log(`更新代币 ${token.mint} 持币人数: ${holdersCount}`);
                } catch (error) {
                    console.error(`更新代币 ${token.mint} 持币人数失败:`, error);
                }
            }));
            
            // 每批次间隔1秒，避免API限制
            if (i + batchSize < tokensToUpdate.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    } catch (error) {
        console.error('更新持币人数据任务失败:', error);
    }
}

module.exports = {
    updateHoldersCount
}; 