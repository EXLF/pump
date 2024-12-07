const TokenDataManager = require('./TokenDataManager');
const { connectDB } = require('./models/db');
const mongoose = require('mongoose');
const cleanupTask = require('./tasks/cleanupTask');

async function main() {
    console.log(JSON.stringify({
        status: 'started',
        message: 'Starting token monitoring with WebSocket'
    }, null, 2));

    try {
        // 先连接数据库
        await connectDB();
        
        // 等待确保数据库连接完全建立
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 启动清理任务
        await cleanupTask.start();

        // 初始化 TokenManager
        const tokenManager = new TokenDataManager();
        tokenManager.initialize();

        // 设置进程错误处理
        process.on('unhandledRejection', (error) => {
            console.error('Unhandled rejection:', error);
        });

        process.on('SIGINT', async () => {
            console.log('Gracefully shutting down...');
            // 关闭数据库连接
            await mongoose.connection.close();
            process.exit(0);
        });

    } catch (error) {
        console.error('启动失败:', error);
        process.exit(1);
    }
}

// 启动程序
main().catch(error => {
    console.error('程序错误:', error);
    process.exit(1);
});

