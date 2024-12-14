# SOL Token Monitor

SOL代币监控系统，用于实时监控和分析 Solana 区块链上的代币数据。

## 项目结构

```
project-root/
├── src/                      # 源代码目录
│   └── services/            # 业务逻辑服务
│       ├── token/          # 代币相关服务
│       │   └── TokenDataManager.js
│       └── websocket/      # WebSocket 相关服务
│           └── websocket.js
├── public/                   # 静态文件
│   ├── css/                # 样式文件
│   │   └── styles.css
│   ├── js/                 # JavaScript 文件
│   │   └── app.js
│   └── index.html         # 主页面
├── config/                   # 配置文件
│   └── ecosystem.config.js  # PM2 配置
├── logs/                     # 日志文件
├── package.json             # 项目配置
├── README.md                # 项目说明
└── server.js                # 应用入口
```

## 目录说明

### src/ - 源代码目录
- **services/**: 核心业务逻辑
  - `token/`: 代币相关服务，处理代币数据的获取和管理
  - `websocket/`: WebSocket 服务，处理实时数据通信

### 其他目录
- **public/**: 静态资源，包含前端界面文件
- **config/**: 配置文件
- **logs/**: 日志文件

## 更新记录

### 2024-01-11
- 优化 WebSocket 连接管理
- 改进实时用户统计功能
- 优化 Dev 列表显示逻辑
- 完善社交媒体链接展示

## 主要功能

### 1. 代币监控
- WebSocket 实时数据通信
- 代币数据实时更新
- 用户在线状态监控

### 2. 数据展示
- 代币列表实时展示
- Dev 监控面板
- 社交媒体链接展示（Twitter、Telegram、Discord、Website）

### 3. 实时通信
- WebSocket 心跳检测
- 自动重连机制
- 用户计数统计

## 运行项目

### 开发环境
```bash
npm run dev
```

### 生产环境
```bash
npm start
```

## 依赖要求
- Node.js >= 14.0.0

## 配置说明
项目配置文件位于 `config/` 目录：
- `ecosystem.config.js`: PM2 部署配置

## 注意事项
- 确保正确配置 WebSocket 连接
- 定期检查日志文件
- 保持网络连接稳定

## 许可证
MIT


