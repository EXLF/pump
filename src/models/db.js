const mongoose = require('mongoose');

// API Key 模型定义
const apiKeySchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    dailyUsage: {
        type: Number,
        default: 0
    },
    lastUsed: {
        type: Date,
        default: Date.now
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// 清理任务日志模型
const cleanupLogSchema = new mongoose.Schema({
    startTime: { 
        type: Date, 
        required: true 
    },
    endTime: { 
        type: Date 
    },
    status: { 
        type: String, 
        enum: ['running', 'completed', 'failed'],
        required: true 
    },
    results: {
        duplicateGroups: {
            groupsProcessed: Number,
            tokensReset: Number
        },
        expiredData: {
            deletedCount: Number
        },
        orphanData: {
            deletedCount: Number
        }
    },
    error: String,
    executionTime: Number // 执行时间（毫秒）
}, {
    timestamps: true
});

// 添加索引优化查询性能
cleanupLogSchema.index({ status: 1, startTime: -1 });
cleanupLogSchema.index({ endTime: -1 });

// 创建一个连接函数
const connectDB = async () => {
    try {
        await mongoose.connect('mongodb://localhost:27017/token_monitor');
        console.log('MongoDB连接成功');
    } catch (error) {
        console.error('MongoDB连接失败:', error);
        throw error;
    }
};

// 代币模型
const tokenSchema = new mongoose.Schema({
    mint: { 
        type: String, 
        required: true, 
        unique: true 
    },
    signer: {
        type: String,
        required: true
    },
    name: String,
    symbol: String,
    timestamp: {
        type: Date,
        required: true
    },
    metadata: {
        uri: String,
        description: String,
        image: String,
        showName: Boolean,
        createdOn: String,
        twitter: String,
        website: String,
        discord: String,
        telegram: String,
        medium: String,
        github: String,
        attributes: Array,
        collection: Object,
        external_url: String
    },
    duplicateGroup: Number,
    duplicateType: String,
    holdersCount: { type: Number, default: 0 },
    lastHoldersUpdate: { type: Date, default: null }
}, {
    timestamps: true
});

// 必要复合索引
tokenSchema.index({ duplicateGroup: 1, timestamp: -1 });

// 添加地址别名 Schema
const addressAliasSchema = new mongoose.Schema({
    address: {
        type: String,
        required: true,
        unique: true
    },
    alias: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// 每天午夜重置使用次数
setInterval(async () => {
    try {
        const now = new Date();
        if (now.getHours() === 0 && now.getMinutes() === 0) {
            await mongoose.model('ApiKey').updateMany({}, { dailyUsage: 0 });
            console.log('已重置所有 API Key 的每日使用次数');
        }
    } catch (error) {
        console.error('重置 API Key 使用次数失败:', error);
    }
}, 60 * 1000);

// 导出连接函数和模型
module.exports = {
    connectDB,
    ApiKey: mongoose.model('ApiKey', apiKeySchema),
    Token: mongoose.model('Token', tokenSchema),
    AddressAlias: mongoose.model('AddressAlias', addressAliasSchema),
    CleanupLog: mongoose.model('CleanupLog', cleanupLogSchema)
}; 