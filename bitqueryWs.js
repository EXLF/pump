const { WebSocket } = require("ws");
const { Token } = require('./models/db');
const { broadcastUpdate } = require('./websocket');

class BitqueryWebSocket {
    constructor() {
        this.token = "ory_at_-JFdtKNUUtMlpSMJPcxg-OzI6I9FsyWLc_pUrj-ZyeY.O8cPOUX4Fw9rY3CV-guoNlp4WKbmVnJ98Hx6sBnXMh4";
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 5000; // 5秒
    }

    connect() {
        this.ws = new WebSocket(
            `wss://streaming.bitquery.io/eap?token=${this.token}`,
            ["graphql-ws"]
        );

        this.ws.on("open", this.handleOpen.bind(this));
        this.ws.on("message", this.handleMessage.bind(this));
        this.ws.on("close", this.handleClose.bind(this));
        this.ws.on("error", this.handleError.bind(this));
    }

    handleOpen() {
        console.log("已连接到 Bitquery");
        this.reconnectAttempts = 0;

        // 发送初始化消息
        const initMessage = JSON.stringify({ type: "connection_init" });
        this.ws.send(initMessage);
    }

    async handleMessage(data) {
        try {
            const response = JSON.parse(data);

            switch (response.type) {
                case "connection_ack":
                    console.log("服务器确认连接");
                    this.sendSubscription();
                    break;

                case "data":
                    await this.processData(response.payload.data);
                    break;

                case "ka":
                    // console.log("保持连接信息已收到");
                    break;

                case "error":
                    console.error("收到错误消息:", response.payload.errors);
                    break;
            }
        } catch (error) {
            console.error("处理消息时出错:", error);
        }
    }

    handleClose() {
        console.log("与 Bitquery 断开连接");
        this.attemptReconnect();
    }

    handleError(error) {
        console.error("WebSocket 错误:", error);
    }

    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`尝试重新连接 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            setTimeout(() => this.connect(), this.reconnectDelay);
        } else {
            console.error("达到最大重连次数，停止重连");
        }
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

    async processData(data) {
        if (!data?.Solana?.Instructions?.length) return;

        const instruction = data.Solana.Instructions[0];
        
        try {
            // 从数据中提取相关信息
            const tokenInfo = {
                mint: instruction.Instruction.Accounts.Token?.Mint,
                timestamp: new Date(instruction.Block.Time),
                // 根据需要添加其他字段
            };

            // 保存到数据库
            const savedToken = await Token.findOneAndUpdate(
                { mint: tokenInfo.mint },
                tokenInfo,
                { upsert: true, new: true }
            );

            if (savedToken) {
                // 获取最新的代币数据用于广播
                const latestTokens = await Token.find()
                    .sort({ timestamp: -1 })
                    .limit(11)
                    .lean();

                // 广播更新
                broadcastUpdate({
                    type: 'tokensUpdate',
                    data: latestTokens
                });
            }

        } catch (error) {
            console.error("处理 Bitquery 数据时出错:", error);
        }
    }
}

module.exports = BitqueryWebSocket; 