const queries = {
    // 代币创建监控查询
    TOKEN_CREATION: `
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
                    Transaction {
                        Signer
                    }
                }
            }
        }
    `
};

// 查询管理器类
class QueryManager {
    constructor() {
        this._queries = new Map(Object.entries(queries));
    }

    // 获取查询
    getQuery(queryName) {
        const query = this._queries.get(queryName);
        if (!query) {
            throw new Error(`Query '${queryName}' not found`);
        }
        return query;
    }

    // 添加新查询
    addQuery(name, query) {
        if (this._queries.has(name)) {
            throw new Error(`Query '${name}' already exists`);
        }
        this._queries.set(name, query);
    }

    // 更新现有查询
    updateQuery(name, query) {
        if (!this._queries.has(name)) {
            throw new Error(`Query '${name}' not found`);
        }
        this._queries.set(name, query);
    }

    // 获取所有查询名称
    getAllQueryNames() {
        return Array.from(this._queries.keys());
    }
}

module.exports = {
    QueryManager,
    defaultQueries: queries
}; 