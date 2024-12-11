const { getHoldersCount } = require('./src/services/holders/holdersService');

async function test() {
    try {
        const count = await getHoldersCount('2GxdEZQ5d9PsUqyGy43qv4fmNJWrnLp6qY4dTyNepump');
        console.log('测试代币持币人数:', count);
    } catch (error) {
        console.error('错误:', error);
    }
}

test(); 