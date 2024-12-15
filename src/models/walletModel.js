const mongoose = require('mongoose');

// 钱包配置模型
const walletConfigSchema = new mongoose.Schema({
    walletAddress: { type: String, required: true, unique: true },
    walletName: { type: String, required: true },
    monitorBuy: { type: Boolean, default: true },
    monitorSell: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    lastChecked: { type: Date },
}, { timestamps: true });

// 交易记录模型
const transactionSchema = new mongoose.Schema({
    walletAddress: { type: String, required: true, index: true },
    tokenSymbol: { type: String, required: true },
    tokenName: { type: String, required: true },
    tokenAddress: { type: String, required: true },
    direction: { type: String, required: true, enum: ['买入', '卖出'] },
    amount: { type: Number, required: true },
    solAmount: { type: Number, required: true },
    status: { type: String, required: true, enum: ['成功', '失败'] },
    timestamp: { type: Date, required: true },
    signature: { type: String, required: true, unique: true }
}, { timestamps: true });

// 创建索引
transactionSchema.index({ timestamp: -1 });
transactionSchema.index({ walletAddress: 1, timestamp: -1 });

const WalletConfig = mongoose.model('WalletConfig', walletConfigSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = {
    WalletConfig,
    Transaction
}; 