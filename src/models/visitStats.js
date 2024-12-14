const mongoose = require('mongoose');

// 定义访问统计Schema
const visitStatsSchema = new mongoose.Schema({
    date: {
        type: Date,
        required: true,
        unique: true
    },
    totalVisits: {
        type: Number,
        default: 0
    },
    uniqueVisitors: {
        type: Number,
        default: 0
    },
    peakOnline: {
        type: Number,
        default: 0
    },
    sourceDistribution: {
        type: Map,
        of: Number,
        default: new Map()
    },
    deviceDistribution: {
        type: Map,
        of: Number,
        default: new Map()
    },
    browserDistribution: {
        type: Map,
        of: Number,
        default: new Map()
    },
    hourlyStats: [{
        hour: Number,
        count: Number,
        timestamp: Date
    }]
}, {
    timestamps: true
});

// 创建模型
const VisitStats = mongoose.model('VisitStats', visitStatsSchema);

// 测试函数：检查集合是否存在
async function testCollection() {
    try {
        // 查询所有记录
        const stats = await VisitStats.find();
        console.log('访问统计集合已存在，当前记录数:', stats.length);
        
        // 如果没有记录，创建一个初始记录
        if (stats.length === 0) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const testStat = new VisitStats({
                date: today,
                totalVisits: 0,
                uniqueVisitors: 0,
                peakOnline: 0,
                sourceDistribution: new Map(),
                deviceDistribution: new Map(),
                browserDistribution: new Map(),
                hourlyStats: []
            });

            await testStat.save();
            console.log('已创建初始访问统计记录');
        }
        
        return true;
    } catch (error) {
        console.error('访问统计集合检查失败:', error);
        return false;
    }
}

// 导出模型和测试函数
module.exports = {
    VisitStats,
    testCollection
}; 