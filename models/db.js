const mongoose = require('mongoose');

// 使用环境变量或默认值
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/pump_tokens';

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => {
    console.log('MongoDB连接成功');
})
.catch(err => {
    console.error('MongoDB连接失败:', err);
    process.exit(1);
});

// 代币模型
const tokenSchema = new mongoose.Schema({
    name: String,
    symbol: String,
    mint: { type: String, unique: true },
    timestamp: Date,
    bondingCurve: String,
    dev: String,
    metadata: {
        name: String,
        symbol: String,
        description: String,
        image: String,
        showName: Boolean,
        createdOn: String,
        twitter: String,
        telegram: String,
        website: String
    },
    duplicateGroup: Number,
    duplicateType: String
}, {
    timestamps: true
});

// 添加索引
tokenSchema.index({ timestamp: -1 }); // 时间戳索引
tokenSchema.index({ mint: 1 }, { unique: true }); // mint地址唯一索引
tokenSchema.index({ symbol: 1 }); // 符号索引
tokenSchema.index({ name: 1 }); // 名称索引
tokenSchema.index({ 'metadata.twitter': 1 }); // twitter链接索引
tokenSchema.index({ duplicateGroup: 1 }); // 重复组索引

const Token = mongoose.model('Token', tokenSchema);

module.exports = { Token }; 