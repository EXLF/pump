require('dotenv').config();

const { WebSocket } = require("ws");
const { ApiKey } = require('./models/db');

class BitqueryWebSocketClient {
    constructor(tokenManager) {
        this.tokenManager = tokenManager;
        this.ws = null;
        this.apiKeys = [];
        this.currentKeyIndex = 0;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = parseInt(process.env.MAX_RECONNECT_ATTEMPTS, 10) || 5;
        this.reconnectDelay = parseInt(process.env.RECONNECT_DELAY, 10) || 5000;
        this.loadApiKeys();
    }

    async loadApiKeys() {
        try {
            const keys = await ApiKey.find({ isActive: true }).select('key');
            this.apiKeys = keys.map(k => k.key);
            console.log(`已加载 ${this.apiKeys.length} 个活跃的 API Keys`);
        } catch (error) {
            console.error('加载 API Keys 失败:', error);
        }
    }

    connect() {
        const currentKey = this.apiKeys[this.currentKeyIndex];
        console.log(currentKey)
        this.ws = new WebSocket(
            `wss://streaming.bitquery.io/eap?token=${currentKey}`,
            ["graphql-ws"]
        );

        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.ws.on("open", () => {
            console.log("WebSocket 连接已建立");
            this.reconnectAttempts = 0;
            // 发送初始化消息
            const initMessage = JSON.stringify({ type: "connection_init" });
            this.ws.send(initMessage);
        });

        this.ws.on("message", async (data) => {
            try {
                const response = JSON.parse(data);
                
                switch (response.type) {
                    case "connection_ack":
                        console.log("服务器确认连接");
                        this.sendSubscription();
                        break;

                    case "data":
                        if (response.payload.data?.Solana?.Instructions?.length > 0) {
                            await this.tokenManager.processWebSocketData(response.payload.data);
                        }
                        break;

                    case "error":
                        console.error("收到错误消息:", response.payload.errors);
                        break;
                }
            } catch (error) {
                console.error("处理消息时出错:", error);
            }
        });

        this.ws.on("close", () => {
            console.log("WebSocket 连接已关闭");
            this.attemptReconnect();
        });

        this.ws.on("error", (error) => {
            console.error("WebSocket 错误:", error);
        });
    }

    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`尝试重新连接 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            setTimeout(() => this.connect(), this.reconnectDelay);
        } else {
            console.error("达到最大重连次数，尝试切换 API key");
            this.rotateApiKey();
        }
    }

    rotateApiKey() {
        this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
        this.reconnectAttempts = 0;
        console.log("切换到新的 API key");
        this.connect();
    }

    sendSubscription() {
        const subscriptionMessage = JSON.stringify({
            type: "start",
            id: "1",
            payload: {
                query: `
                subscription {
                    Solana {
                        Instructions(
                            where: {Instruction: {Program: {Method: {is: "create"}, Name: {is: "pump"}}}}
                        ) {
                            Block {
                                Time
                            }
                            Instruction {
                                Accounts {
                                    Token {
                                        Mint
                                        Owner
                                    }
                                }
                                Program {
                                    Arguments {
                                        Name
                                        Type
                                        Value {
                                            ... on Solana_ABI_String_Value_Arg {
                                                string
                                            }
                                        }
                                    }
                                    Method
                                    Name
                                }
                            }
                        }
                    }
                }
                `
            }
        });

        this.ws.send(subscriptionMessage);
        console.log("订阅消息已发送");
    }
}

module.exports = BitqueryWebSocketClient; 