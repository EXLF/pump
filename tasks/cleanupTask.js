const cron = require('node-cron');
const { Token } = require('../models/db');

class DatabaseCleanupTask {
    constructor() {
        // 每小时执行一次
        this.cleanupSchedule = '0 * * * *';
        // 保留12小时的数据
        this.retentionPeriod = 12 * 60 * 60 * 1000;
    }

    async start() {
        // 启动时先执行一次清理
        await this.cleanup();

        // 设置定时任务
        cron.schedule(this.cleanupSchedule, async () => {
            await this.cleanup();
        });
    }

    async cleanup() {
        try {
            const cutoffDate = new Date(Date.now() - this.retentionPeriod);
            
            // 先获取要删除的数据数量
            const countToDelete = await Token.countDocuments({
                timestamp: { $lt: cutoffDate }
            });


            if (countToDelete > 0) {
                console.log(`开始清理数据，将删除 ${countToDelete} 条记录...`);
                
                // 执行删除
                const result = await Token.deleteMany({
                    timestamp: { $lt: cutoffDate }
                });

                console.log(`清理完成: 删除了 ${result.deletedCount} 条记录`);
                console.log(`当前数据库中剩下 ${await Token.countDocuments()} 条记录`);
            } else {
                console.log('没有需要清理的数据');
            }
        } catch (error) {
            console.error('数据清理失败:', error);
        }
    }
}

module.exports = new DatabaseCleanupTask(); 