const express = require('express');
const router = express.Router();
const geoip = require('geoip-lite');
const { VisitStats } = require('../../models/visitStats');

// 在线用户数据存储（内存中的临时数据）
const onlineStats = {
    dailyStats: new Map(), // 存储每日统计数据
    peakOnline: 0,
    todayVisits: 0,
    onlineTrend: [], // 存储24小时趋势数据
    sourceDistribution: new Map() // 存储来源分布数据
};

// 更新访问统计数据
async function updateVisitStats(ip, userAgent) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        // 获取或创建今天的统计记录
        let stats = await VisitStats.findOne({ date: today });
        if (!stats) {
            stats = new VisitStats({
                date: today,
                totalVisits: 0,
                uniqueVisitors: 0,
                peakOnline: 0,
                sourceDistribution: new Map(),
                hourlyStats: []
            });
        }

        // 更新总访问量
        stats.totalVisits += 1;
        onlineStats.todayVisits = stats.totalVisits;

        // ��新来源分布
        const geo = geoip.lookup(ip);
        if (geo) {
            const country = geo.country || 'unknown';
            const currentCount = stats.sourceDistribution.get(country) || 0;
            stats.sourceDistribution.set(country, currentCount + 1);
            onlineStats.sourceDistribution.set(country, currentCount + 1);
        }

        // 更新小时统计
        const currentHour = new Date().getHours();
        let hourStat = stats.hourlyStats.find(stat => stat.hour === currentHour);
        if (hourStat) {
            hourStat.count += 1;
            hourStat.timestamp = new Date();
        } else {
            stats.hourlyStats.push({
                hour: currentHour,
                count: 1,
                timestamp: new Date()
            });
        }

        // 更新在线趋势数据
        const now = Date.now();
        const currentOnline = global.wsConnections ? global.wsConnections.size : 0;
        onlineStats.onlineTrend.push({
            time: now,
            count: currentOnline
        });

        // 只保留最近24小时的数据
        const dayAgo = now - 24 * 60 * 60 * 1000;
        onlineStats.onlineTrend = onlineStats.onlineTrend.filter(point => point.time > dayAgo);

        // 更新峰值在线人数
        if (currentOnline > stats.peakOnline) {
            stats.peakOnline = currentOnline;
            onlineStats.peakOnline = currentOnline;
        }

        await stats.save();
    } catch (error) {
        console.error('更新访问统计失败:', error);
    }
}

// 获取在线统计数据
router.get('/stats', async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const stats = await VisitStats.findOne({ date: today });
        const currentOnline = global.wsConnections ? global.wsConnections.size : 0;
        
        // 计算平均在线时长
        let totalOnlineTime = 0;
        let activeUserCount = 0;
        if (global.activeUsers) {
            const now = Date.now();
            for (const [_, userData] of global.activeUsers) {
                if (now - userData.lastActive <= global.TIMEOUT) {
                    totalOnlineTime += (now - userData.firstSeen);
                    activeUserCount++;
                }
            }
        }

        const avgOnlineTime = activeUserCount > 0 ? Math.floor(totalOnlineTime / activeUserCount / 1000) : 0;

        res.json({
            currentOnline,
            todayStats: stats ? {
                totalVisits: stats.totalVisits,
                peakOnline: Math.max(stats.peakOnline, currentOnline, onlineStats.peakOnline),
                avgOnlineTime,
                sourceDistribution: Object.fromEntries(stats.sourceDistribution),
                hourlyStats: stats.hourlyStats,
                onlineTrend: onlineStats.onlineTrend
            } : {
                totalVisits: 0,
                peakOnline: Math.max(currentOnline, onlineStats.peakOnline),
                avgOnlineTime: 0,
                sourceDistribution: {},
                hourlyStats: [],
                onlineTrend: [{time: Date.now(), count: currentOnline}]
            }
        });
    } catch (error) {
        console.error('获取统计数据失败:', error);
        res.status(500).json({ error: '获取统计数据失败' });
    }
});

// 获取在线用户列表
router.get('/online-users', (req, res) => {
    try {
        const now = Date.now();
        const users = [];
        
        if (global.activeUsers) {
            for (const [clientId, userData] of global.activeUsers) {
                if (now - userData.lastActive <= global.TIMEOUT) {
                    const geo = geoip.lookup(userData.ip);
                    users.push({
                        clientId,
                        ip: userData.ip,
                        location: geo ? `${geo.country}${geo.city ? ` - ${geo.city}` : ''}` : '未知',
                        userAgent: userData.userAgent,
                        onlineTime: now - userData.firstSeen,
                        lastActive: userData.lastActive,
                        visitCount: userData.visitCount || 1
                    });
                }
            }
        }

        res.json(users);
    } catch (error) {
        console.error('获取在线用户列表失败:', error);
        res.status(500).json({ error: '获取在线用户列表失败' });
    }
});

// 获取历史统计数据
router.get('/stats/history', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const stats = await VisitStats.find({
            date: {
                $gte: startDate,
                $lte: endDate
            }
        }).sort({ date: 1 });

        res.json(stats);
    } catch (error) {
        console.error('获取历史统计数据失败:', error);
        res.status(500).json({ error: '获取历史统计数据失败' });
    }
});

module.exports = {
    router,
    updateVisitStats
}; 