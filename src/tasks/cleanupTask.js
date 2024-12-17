const cron = require('node-cron');
const { Token, CleanupLog } = require('../models/db');

class CleanupTask {
    constructor() {
        this.isRunning = false;
        this.lastCleanupTime = null;
        this.currentLog = null;
    }

    async start() {
        if (this.isRunning) {
            console.log('清理任务已经在运行中');
            return;
        }

        this.isRunning = true;
        console.log('启动清理任务');

        // 每天凌晨3点运行清理任务
        cron.schedule('0 3 * * *', async () => {
            try {
                await this.cleanup();
                this.lastCleanupTime = new Date();
            } catch (error) {
                console.error('清理任务执行失败:', error);
                // 确保错误被记录到日志中
                if (this.currentLog) {
                    this.currentLog.status = 'failed';
                    this.currentLog.error = error.message;
                    this.currentLog.endTime = new Date();
                    this.currentLog.executionTime = Date.now() - this.currentLog.startTime.getTime();
                    await this.currentLog.save();
                }
            }
        });

        // 立即执行一次清理
        await this.cleanup();
    }

    async cleanup() {
        // 创建新的日志记录
        this.currentLog = new CleanupLog({
            startTime: new Date(),
            status: 'running'
        });
        await this.currentLog.save();

        try {
            console.log('开始执行清理任务:', new Date());

            // 1. 清理无效的重复组
            const duplicateResult = await this.cleanupDuplicateGroups();
            console.log('重复组清理结果:', duplicateResult);

            // 2. 清理过期数据
            const expiredResult = await this.cleanupExpiredData();
            console.log('过期数据清理结果:', expiredResult);

            // 3. 清理孤立数据
            const orphanResult = await this.cleanupOrphanData();
            console.log('孤立数据清理结果:', orphanResult);

            // 更新日志
            this.currentLog.status = 'completed';
            this.currentLog.endTime = new Date();
            this.currentLog.executionTime = Date.now() - this.currentLog.startTime.getTime();
            this.currentLog.results = {
                duplicateGroups: duplicateResult,
                expiredData: expiredResult,
                orphanData: orphanResult
            };
            await this.currentLog.save();

            console.log('清理任务完成:', new Date());
        } catch (error) {
            console.error('清理过程中出错:', error);
            this.currentLog.status = 'failed';
            this.currentLog.error = error.message;
            this.currentLog.endTime = new Date();
            this.currentLog.executionTime = Date.now() - this.currentLog.startTime.getTime();
            await this.currentLog.save();
            throw error;
        }
    }

    async cleanupDuplicateGroups() {
        // 清理重复组的详细逻辑
        const result = await Token.aggregate([
            {
                $match: {
                    duplicateGroup: { $ne: null },
                    timestamp: { 
                        $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7天前的数据
                    }
                }
            },
            {
                $group: {
                    _id: "$duplicateGroup",
                    count: { $sum: 1 },
                    tokens: { $push: "$mint" }
                }
            },
            {
                $match: {
                    $or: [
                        { count: { $lte: 1 } },  // 单个token的组
                        { count: { $gt: 200 } }  // 异常大的组
                    ]
                }
            }
        ]);

        let resetCount = 0;
        for (const group of result) {
            const updateResult = await Token.updateMany(
                { mint: { $in: group.tokens } },
                { 
                    $set: { 
                        duplicateGroup: null,
                        duplicateType: null 
                    }
                }
            );
            resetCount += updateResult.modifiedCount;
        }

        return {
            groupsProcessed: result.length,
            tokensReset: resetCount
        };
    }

    async cleanupExpiredData() {
        // 清理过期数据
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const result = await Token.deleteMany({
            timestamp: { $lt: thirtyDaysAgo },
            duplicateGroup: null
        });

        return {
            deletedCount: result.deletedCount
        };
    }

    async cleanupOrphanData() {
        // 清理孤立数据（没有关联的数据）
        const result = await Token.deleteMany({
            $or: [
                { metadata: null },
                { metadata: {} },
                { name: null },
                { symbol: null }
            ]
        });

        return {
            deletedCount: result.deletedCount
        };
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            lastCleanupTime: this.lastCleanupTime,
            nextScheduledCleanup: this.getNextScheduledTime(),
            currentLog: this.currentLog
        };
    }

    getNextScheduledTime() {
        const now = new Date();
        const next = new Date(now);
        next.setHours(3, 0, 0, 0);
        if (next <= now) {
            next.setDate(next.getDate() + 1);
        }
        return next;
    }

    async getCleanupLogs(limit = 10) {
        return await CleanupLog.find()
            .sort({ startTime: -1 })
            .limit(limit);
    }
}

module.exports = new CleanupTask(); 