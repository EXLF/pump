# SOL Token Monitor

SOL代币监控系统，用于实时监控和分析 Solana 区块链上的代币数据。

## 项目结构

```
project-root/
├── src/                      # 源代码目录
│   ├── api/                  # API 相关
│   │   ├── routes/          # 路由定义
│   │   └── controllers/     # 路由处理器
│   ├── services/            # 业务逻辑服务
│   │   ├── token/          # 代币相关服务
│   │   │   ├── TokenDataManager.js
│   │   │   └── getTokenInfo.js
│   │   └── websocket/      # WebSocket 相关服务
│   │       ├── BitqueryWebSocketClient.js
│   │       └── websocket.js
│   ├── graphql/             # GraphQL 相关
│   │   ├── queries.js      # 查询定义
│   │   └── SubscriptionManager.js  # 订阅管理
│   ├── models/              # 数据模型
│   │   └── db.js           # 数据库模型定义
│   ├── queue/               # 队列相关
│   │   ├── processors/     # 队列处理器
│   │   └── jobs/          # 任务定义
│   ├── tasks/               # 定时任务
│   │   └── cleanupTask.js  # 清理任务
│   └── utils/               # 工具函数
├── public/                   # 静态文件
│   ├── admin/              # 管理界面
│   └── assets/             # 资源文件
├── config/                   # 配置文件
│   ├── ecosystem.config.js  # PM2 配置
│   └── .env                # 环境变量
├── tests/                    # 测试文件
├── logs/                     # 日志文件
├── package.json             # 项目配置
├── README.md                # 项目说明
└── server.js                # 应用入口
```

## 目录说明

### src/ - 源代码目录
- **api/**: API 接口相关代码
  - `routes/`: 路由定义
  - `controllers/`: 路由处理器
- **services/**: 核心业务逻辑
  - `token/`: 代币相关服务
  - `websocket/`: WebSocket 相关服务
- **graphql/**: GraphQL 相关代码
  - `queries.js`: 查询定义
  - `SubscriptionManager.js`: 订阅管理
- **models/**: 数据库模型
- **queue/**: 队列处理
- **tasks/**: 定时任务
- **utils/**: 工具函数

### 其他目录
- **public/**: 静态资源
- **config/**: 配置文件
- **tests/**: 测试文件
- **logs/**: 日志文件

## 更新记录

### 2024-12-11
- 优化项目目录结构
- 重构 WebSocket 客户端
- 实现订阅管理器
- 添加清理任务

### 2024-12-10
- 添加 GraphQL 查询管理器
- 优化代码组织
- 完善错误处理

## 主要功能

### 1. 代币监控
- WebSocket 实时数据接收
- GraphQL 查询管理
- 自动重连和错误恢复

### 2. 数据处理
- 批量处理机制
- 队列任务处理
- 数据清理任务

### 3. API 服务
- RESTful API
- WebSocket 实时推送
- 数据缓存处理

## 运行项目

### 开发环境
```bash
npm run dev
```

### 生产环境
```bash
npm start
```

### 代币监控
```bash
npm run monitor
```

## 依赖要求
- Node.js >= 14.0.0
- MongoDB >= 4.0
- Redis >= 6.0

## 配置说明
项目配置文件位于 `config/` 目录：
- `.env`: 环境变量配置
- `ecosystem.config.js`: PM2 部署配置

## 注意事项
- 确保 MongoDB 和 Redis 服务正在运行
- 配置正确的环境变量
- 定期检查日志文件

## 开发指南

### 添加新的 GraphQL 查询
1. 在 `src/graphql/queries.js` 中定义查询
2. 使用 QueryManager 注册查询
3. 在 WebSocket 客户端中使用

### 添加新的服务
1. 在 `src/services` 下创建相应目录
2. 实现服务逻辑
3. 在 `server.js` 中引入和使用

## 许可证
MIT


