const { QueryManager } = require('./queries');

class SubscriptionManager {
    constructor(wsClient) {
        this.wsClient = wsClient;
        this.queryManager = new QueryManager();
        this.activeSubscriptions = new Map();
        this.subscriptionCallbacks = new Map();
    }

    // 添加新的订阅
    subscribe(queryName, callback) {
        if (!this.activeSubscriptions.has(queryName)) {
            const query = this.queryManager.getQuery(queryName);
            const subscriptionId = `${queryName}_${Date.now()}`;
            
            const subscriptionMessage = {
                type: "start",
                id: subscriptionId,
                payload: { query }
            };

            this.activeSubscriptions.set(queryName, subscriptionId);
            if (callback) {
                this.subscriptionCallbacks.set(subscriptionId, callback);
            }

            return this.wsClient.send(JSON.stringify(subscriptionMessage));
        }
        return false;
    }

    // 取消订阅
    unsubscribe(queryName) {
        const subscriptionId = this.activeSubscriptions.get(queryName);
        if (subscriptionId) {
            const unsubscribeMessage = {
                type: "stop",
                id: subscriptionId
            };

            this.wsClient.send(JSON.stringify(unsubscribeMessage));
            this.activeSubscriptions.delete(queryName);
            this.subscriptionCallbacks.delete(subscriptionId);
            return true;
        }
        return false;
    }

    // 处理接收到的消息
    handleMessage(message) {
        const { id, type, payload } = message;
        const callback = this.subscriptionCallbacks.get(id);
        
        if (callback && type === 'data') {
            callback(payload.data);
        }
    }

    // 获取活跃的订阅列表
    getActiveSubscriptions() {
        return Array.from(this.activeSubscriptions.keys());
    }

    // 重新订阅所有活跃的订阅
    resubscribeAll() {
        const activeSubscriptions = this.getActiveSubscriptions();
        this.activeSubscriptions.clear();
        
        activeSubscriptions.forEach(queryName => {
            const callback = this.subscriptionCallbacks.get(
                this.activeSubscriptions.get(queryName)
            );
            this.subscribe(queryName, callback);
        });
    }

    // 清除所有订阅
    clearAll() {
        this.activeSubscriptions.forEach((_, queryName) => {
            this.unsubscribe(queryName);
        });
    }
}

module.exports = SubscriptionManager; 