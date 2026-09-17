"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditLogger = exports.logger = void 0;
exports.requestLogger = requestLogger;
const winston_1 = __importDefault(require("winston"));
const winston_daily_rotate_file_1 = __importDefault(require("winston-daily-rotate-file"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// Ensure logs directory exists
const logsDir = path_1.default.resolve(process.cwd(), 'logs');
if (!fs_1.default.existsSync(logsDir)) {
    fs_1.default.mkdirSync(logsDir, { recursive: true });
}
const logFormat = winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }), winston_1.default.format.errors({ stack: true }), winston_1.default.format.splat(), winston_1.default.format.json());
// Daily rotate file transport for general app logs - strictly kept for at least 90 days
const appRotateTransport = new winston_daily_rotate_file_1.default({
    filename: path_1.default.join(logsDir, 'application-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '90d',
    level: 'info'
});
// Daily rotate file transport for errors - strictly kept for at least 90 days
const errorRotateTransport = new winston_daily_rotate_file_1.default({
    filename: path_1.default.join(logsDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '90d',
    level: 'error'
});
// Daily rotate file transport for audit events - strictly kept for at least 90 days
const auditRotateTransport = new winston_daily_rotate_file_1.default({
    filename: path_1.default.join(logsDir, 'audit-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '90d',
    level: 'info'
});
exports.logger = winston_1.default.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: logFormat,
    defaultMeta: { service: 'autosuite-erp' },
    transports: [
        appRotateTransport,
        errorRotateTransport,
        new winston_1.default.transports.Console({
            format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.printf(({ level, message, timestamp, stack, ...meta }) => {
                const metaStr = Object.keys(meta).length > 1 ? ` ${JSON.stringify(meta)}` : '';
                return `[${timestamp}] ${level}: ${stack || message}${metaStr}`;
            }))
        })
    ]
});
// Dedicated audit file logger
exports.auditLogger = winston_1.default.createLogger({
    level: 'info',
    format: logFormat,
    defaultMeta: { service: 'autosuite-audit' },
    transports: [
        auditRotateTransport
    ]
});
// Express request logging middleware
function requestLogger(req, res, next) {
    const start = Date.now();
    const { method, originalUrl, ip } = req;
    res.on('finish', () => {
        const duration = Date.now() - start;
        const statusCode = res.statusCode;
        const userId = req.user?.userId || 'anonymous';
        const username = req.user?.username || 'anonymous';
        const logData = {
            method,
            url: originalUrl,
            status: statusCode,
            durationMs: duration,
            ip: ip || req.socket.remoteAddress,
            userId,
            username,
            userAgent: req.get('user-agent')
        };
        if (statusCode >= 500) {
            exports.logger.error(`HTTP ${method} ${originalUrl} ${statusCode} - ${duration}ms`, logData);
        }
        else if (statusCode >= 400) {
            exports.logger.warn(`HTTP ${method} ${originalUrl} ${statusCode} - ${duration}ms`, logData);
        }
        else {
            exports.logger.info(`HTTP ${method} ${originalUrl} ${statusCode} - ${duration}ms`, logData);
        }
    });
    next();
}
