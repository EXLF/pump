# SOL Token Monitor

SOL代币监控系统，用于实时监控和分析 Solana 区块链上的代币数据。

## 功能特点

### 1. 实时监控
- WebSocket 实时接收代币数据
- 自动处理和分析新代币信息
- 实时更新前端显示

### 2. 数据处理
- 使用 Bull 队列处理数据，确保可靠性
- 自动获取和解析代币元数据
- IPFS 内容多网关获取支持

### 3. 重复检测
- 多维度重复代币检测
  - Twitter 状态匹配（最高优先级）
  - 代币符号匹配
  - 代币名称匹配
- 智能分组算法
- 重复组优先级管理

### 4. 性能优化
- MongoDB 索引优化
- 数据缓存处理
- 批量处理机制

## 技术栈

- **后端**
  - Node.js
  - Express
  - MongoDB
  - Bull (Redis)
  - WebSocket

- **数据库**
  - MongoDB
  - Redis (队列和缓存)

## 安装要求

- Node.js >= 14.x
- MongoDB >= 4.x
- Redis >= 6.x


