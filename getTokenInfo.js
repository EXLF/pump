const TokenDataManager = require('./TokenDataManager');

async function main() {
    console.log(JSON.stringify({
        status: 'started',
        message: 'Starting token monitoring with WebSocket'
    }, null, 2));

    try {
        const tokenManager = new TokenDataManager();
        tokenManager.initialize();

        // 设置进程错误处理
        process.on('unhandledRejection', (error) => {
            console.error('Unhandled rejection:', error);
        });

        process.on('SIGINT', () => {
            console.log('Gracefully shutting down...');
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