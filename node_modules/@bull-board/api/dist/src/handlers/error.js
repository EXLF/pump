"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
function errorHandler(error) {
    return {
        status: 500,
        body: {
            error: 'Internal server error',
            message: error.message,
            details: error.stack,
        },
    };
}
//# sourceMappingURL=error.js.map