const express = require('express');
const router = express.Router();
const { PublicKey } = require('@solana/web3.js');
const { WalletConfig, Transaction } = require('../../models/walletModel');
const walletService = require('../../services/walletService');

// 获取所有监控的钱包列表
router.get('/wallets', async (req, res) => {
    try {
        const wallets = await WalletConfig.find()
            .select('-__v')
            .sort({ createdAt: -1 });
        res.json({
            success: true,
            data: wallets
        });
    } catch (error) {
        console.error('获取钱包列表失败:', error);
        res.status(500).json({
            success: false,
            error: '获取钱包列表失败'
        });
    }
});

// 添加新的监控钱包
router.post('/wallets', async (req, res) => {
    try {
        const { walletAddress, walletName, monitorBuy = true, monitorSell = true } = req.body;

        // 验证钱包地址格式
        try {
            new PublicKey(walletAddress);
        } catch (error) {
            return res.status(400).json({
                success: false,
                error: '无效的钱包地址格式'
            });
        }

        // 检查是否已存在
        const existing = await WalletConfig.findOne({ walletAddress });
        if (existing) {
            return res.status(400).json({
                success: false,
                error: '该钱包地址已在监控列表中'
            });
        }

        // 创建新的钱包配置
        const walletConfig = new WalletConfig({
            walletAddress,
            walletName,
            monitorBuy,
            monitorSell
        });

        // 保存配置
        await walletConfig.save();

        // 启动监控
        await walletService.startMonitoring(walletConfig);

        res.json({
            success: true,
            data: walletConfig
        });
    } catch (error) {
        console.error('添加监控钱包失败:', error);
        res.status(500).json({
            success: false,
            error: '添加监控钱包失败'
        });
    }
});

// 更新钱包监控配置
router.put('/wallets/:address', async (req, res) => {
    try {
        const { address } = req.params;
        const { walletName, monitorBuy, monitorSell, isActive } = req.body;

        // 查找并更新钱包配置
        const walletConfig = await WalletConfig.findOne({ walletAddress: address });
        if (!walletConfig) {
            return res.status(404).json({
                success: false,
                error: '未找到该钱包配置'
            });
        }

        // 更新字段
        if (walletName !== undefined) walletConfig.walletName = walletName;
        if (monitorBuy !== undefined) walletConfig.monitorBuy = monitorBuy;
        if (monitorSell !== undefined) walletConfig.monitorSell = monitorSell;
        if (isActive !== undefined) {
            walletConfig.isActive = isActive;
            // 根据状态启动或停止监控
            if (isActive) {
                await walletService.startMonitoring(walletConfig);
            } else {
                walletService.stopMonitoring(walletConfig.walletAddress);
            }
        }

        await walletConfig.save();

        res.json({
            success: true,
            data: walletConfig
        });
    } catch (error) {
        console.error('更新钱包配置失败:', error);
        res.status(500).json({
            success: false,
            error: '更新钱包配置失败'
        });
    }
});

// 删除监控钱包
router.delete('/wallets/:address', async (req, res) => {
    try {
        const { address } = req.params;

        // 停止监控
        walletService.stopMonitoring(address);

        // 删除配置
        const result = await WalletConfig.deleteOne({ walletAddress: address });
        
        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                error: '未找到该钱包配置'
            });
        }

        res.json({
            success: true,
            message: '已删除钱包监控'
        });
    } catch (error) {
        console.error('删除钱包监控失败:', error);
        res.status(500).json({
            success: false,
            error: '删除钱包监控失败'
        });
    }
});

// 获取钱包的交易历史
router.get('/wallets/:address/transactions', async (req, res) => {
    try {
        const { address } = req.params;
        const { limit = 100, skip = 0, startTime, endTime } = req.query;

        // 构建查询条件
        const query = { walletAddress: address };
        if (startTime || endTime) {
            query.timestamp = {};
            if (startTime) query.timestamp.$gte = new Date(startTime);
            if (endTime) query.timestamp.$lte = new Date(endTime);
        }

        // 获取交易记录
        const transactions = await Transaction.find(query)
            .sort({ timestamp: -1 })
            .skip(Number(skip))
            .limit(Number(limit))
            .select('-__v');

        // 获取总记录数
        const total = await Transaction.countDocuments(query);

        res.json({
            success: true,
            data: {
                transactions,
                total,
                limit: Number(limit),
                skip: Number(skip)
            }
        });
    } catch (error) {
        console.error('获取交易历史失败:', error);
        res.status(500).json({
            success: false,
            error: '获取交易历史失败'
        });
    }
});

// 获取钱包的统计信息
router.get('/wallets/:address/stats', async (req, res) => {
    try {
        const { address } = req.params;
        const { startTime, endTime } = req.query;

        // 构建查询条件
        const query = { walletAddress: address };
        if (startTime || endTime) {
            query.timestamp = {};
            if (startTime) query.timestamp.$gte = new Date(startTime);
            if (endTime) query.timestamp.$lte = new Date(endTime);
        }

        // 获取统计信息
        const stats = await Transaction.aggregate([
            { $match: query },
            { $group: {
                _id: null,
                totalTransactions: { $sum: 1 },
                buyCount: { $sum: { $cond: [{ $eq: ['$direction', '买入'] }, 1, 0] } },
                sellCount: { $sum: { $cond: [{ $eq: ['$direction', '卖出'] }, 1, 0] } },
                successCount: { $sum: { $cond: [{ $eq: ['$status', '成功'] }, 1, 0] } },
                failCount: { $sum: { $cond: [{ $eq: ['$status', '失败'] }, 1, 0] } },
                totalSolAmount: { $sum: '$solAmount' }
            }}
        ]);

        res.json({
            success: true,
            data: stats[0] || {
                totalTransactions: 0,
                buyCount: 0,
                sellCount: 0,
                successCount: 0,
                failCount: 0,
                totalSolAmount: 0
            }
        });
    } catch (error) {
        console.error('获取钱包统计信息失败:', error);
        res.status(500).json({
            success: false,
            error: '获取钱包统计信息失败'
        });
    }
});

// 获取RPC连接状态
router.get('/wallets/:address/rpc-status', async (req, res) => {
    try {
        const { address } = req.params;
        
        // 检查钱包是否存在
        const walletConfig = await WalletConfig.findOne({ walletAddress: address });
        if (!walletConfig) {
            return res.status(404).json({
                success: false,
                error: '未找到该钱包配置'
            });
        }

        // 获取RPC���接状态
        try {
            const connection = walletService.connection;
            const version = await connection.getVersion();
            const slot = await connection.getSlot();
            const health = await connection.getHealth();

            res.json({
                success: true,
                data: {
                    connected: true,
                    version,
                    currentSlot: slot,
                    health,
                    endpoint: connection._rpcEndpoint,
                    commitment: connection._commitment
                }
            });
        } catch (error) {
            res.json({
                success: false,
                data: {
                    connected: false,
                    error: error.message
                }
            });
        }
    } catch (error) {
        console.error('获取RPC状态失败:', error);
        res.status(500).json({
            success: false,
            error: '获取RPC状态失败'
        });
    }
});

// 获取所有钱包的交易历史
router.get('/wallets/transactions', async (req, res) => {
    try {
        const { limit = 100, skip = 0, startTime, endTime } = req.query;

        // 构建查询条件
        const query = {};
        if (startTime || endTime) {
            query.timestamp = {};
            if (startTime) query.timestamp.$gte = new Date(startTime);
            if (endTime) query.timestamp.$lte = new Date(endTime);
        }

        // 获取交易记录
        const transactions = await Transaction.find(query)
            .sort({ timestamp: -1 })
            .skip(Number(skip))
            .limit(Number(limit))
            .select('-__v');

        // 获取总记录数
        const total = await Transaction.countDocuments(query);

        res.json({
            success: true,
            data: {
                transactions,
                total,
                limit: Number(limit),
                skip: Number(skip)
            }
        });
    } catch (error) {
        console.error('获取所有交易历史失败:', error);
        res.status(500).json({
            success: false,
            error: '获取所有交易历史失败'
        });
    }
});

module.exports = router; 