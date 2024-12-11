const cron = require('node-cron');
const { Token } = require('../models/db');

class CleanupTask {
    constructor() {
        this.isRunning = false;
    }

    async start() {
        if (this.isRunning) {
            console.log('清理任务已经在运行');
            return;
        }

        this.isRunning = true;
        console.log('启动清理任务');

        // 每天凌晨3点运行清理任务
        cron.schedule('0 3 * * *', async () => {
            try {
                await this.cleanup();
            } catch (error) {
                console.error('清理任务执行失败:', error);
            }
        });

        // 立即执行一次清理
        await this.cleanup();
    }

    async cleanup() {
        try {
            console.log('开始执行清理任务');

            // 清理重复组
            const result = await Token.aggregate([
                { $match: { duplicateGroup: { $ne: null } } },
                { $group: { _id: "$duplicateGroup", count: { $sum: 1 } } },
                { $match: { count: { $lte: 1 } } }
            ]);

            if (result.length > 0) {
                const groupsToReset = result.map(r => r._id);
                await Token.updateMany(
                    { duplicateGroup: { $in: groupsToReset } },
                    { $set: { duplicateGroup: null } }
                );
                console.log(`已重置 ${groupsToReset.length} 个无效的重复组`);
            }

            // 其他清理任务可以在这里添加
            
            console.log('清理任务完成');
        } catch (error) {
            console.error('清理过程中出错:', error);
            throw error;
        }
    }

    stop() {
        this.isRunning = false;
        console.log('清理任务已停止');
    }
}

module.exports = new CleanupTask(); 