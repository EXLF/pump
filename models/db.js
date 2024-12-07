const mongoose = require('mongoose');

// API Key 模型定义
const apiKeySchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true
    },
    description: {
        type: String,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// 创建一个连接函数
const connectDB = async () => {
    try {
        await mongoose.connect('mongodb://localhost:27017/pump_tokens', {
            maxPoolSize: 20,
            w: 'majority',
            readPreference: 'secondaryPreferred'
        });
        console.log('MongoDB连接成功');
    } catch (err) {
        console.error('MongoDB连接失败:', err);
        process.exit(1);
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
    duplicateType: String
}, {
    timestamps: true // 添加 createdAt 和 updatedAt
});

// 添加复合索引，用于常用的组合查询
tokenSchema.index({ mint: 1, timestamp: -1 }); // mint 查询时通常需要时间排序
tokenSchema.index({ signer: 1, timestamp: -1 }); // signer 查询时通常需要时间排序

// 保留最常用的单字段索引
tokenSchema.index({ timestamp: -1 }); // 使用 -1 支持时间倒序查询
tokenSchema.index({ duplicateGroup: 1 });
tokenSchema.index({ duplicateType: 1 });

// 为常用的元数据字段创建稀疏索引
tokenSchema.index({ 'metadata.twitter': 1 }, { sparse: true });
tokenSchema.index({ 'metadata.telegram': 1 }, { sparse: true });
tokenSchema.index({ 'metadata.website': 1 }, { sparse: true });

// 创建文本索引用于搜索
tokenSchema.index(
    { 
        name: 'text',
        symbol: 'text',
        'metadata.description': 'text' 
    },
    {
        weights: {
            name: 10,
            symbol: 5,
            'metadata.description': 1
        },
        name: "TokenTextIndex"
    }
);

// 部分索引 - 只为活跃记录创建索引
tokenSchema.index(
    { 'metadata.showName': 1 },
    { 
        partialFilterExpression: { 'metadata.showName': { $exists: true } }
    }
);

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

// 导出连接函数和模型
module.exports = {
    connectDB,
    ApiKey: mongoose.model('ApiKey', apiKeySchema),
    Token: mongoose.model('Token', tokenSchema),
    AddressAlias: mongoose.model('AddressAlias', addressAliasSchema)
}; 