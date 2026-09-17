"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditLogger = exports.logger = exports.logsDir = void 0;
exports.requestLogger = requestLogger;
const winston_1 = __importDefault(require("winston"));
const winston_daily_rotate_file_1 = __importDefault(require("winston-daily-rotate-file"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
// Determine a safe writable logs directory
let logsDir;
const isServerless = Boolean(process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.NETLIFY ||
    process.env.SERVERLESS ||
    process.env.DISABLE_FILE_LOGS === 'true');
if (isServerless) {
    exports.logsDir = logsDir = path_1.default.join(os_1.default.tmpdir(), 'logs');
}
else {
    exports.logsDir = logsDir = path_1.default.resolve(process.cwd(), 'logs');
}
// Try creating logs directory safely, fallback to os.tmpdir() if cwd is read-only (EROFS)
let fileLoggingDisabled = false;
try {
    if (!fs_1.default.existsSync(logsDir)) {
        fs_1.default.mkdirSync(logsDir, { recursive: true });
    }
}
catch (err) {
    if (err.code === 'EROFS' || err.code === 'EACCES') {
        exports.logsDir = logsDir = path_1.default.join(os_1.default.tmpdir(), 'logs');
        try {
            if (!fs_1.default.existsSync(logsDir)) {
                fs_1.default.mkdirSync(logsDir, { recursive: true });
            }
        }
        catch (tmpErr) {
            console.warn('[Logger] File logging disabled (read-only file system):', tmpErr);
            fileLoggingDisabled = true;
        }
    }
    else {
        fileLoggingDisabled = true;
    }
}
const logFormat = winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }), winston_1.default.format.errors({ stack: true }), winston_1.default.format.splat(), winston_1.default.format.json());
const mainTransports = [
    new winston_1.default.transports.Console({
        format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.printf(({ level, message, timestamp, stack, ...meta }) => {
            const metaStr = Object.keys(meta).length > 1 ? ` ${JSON.stringify(meta)}` : '';
            return `[${timestamp}] ${level}: ${stack || message}${metaStr}`;
        }))
    })
];
const auditTransports = [
    new winston_1.default.transports.Console({
        format: winston_1.default.format.combine(winston_1.default.format.printf(({ timestamp, message, ...meta }) => {
            return `[AUDIT ${timestamp}] ${message} ${JSON.stringify(meta)}`;
        }))
    })
];
if (!fileLoggingDisabled) {
    try {
        const appRotateTransport = new winston_daily_rotate_file_1.default({
            filename: path_1.default.join(logsDir, 'application-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '90d',
            level: 'info'
        });
        appRotateTransport.on('error', (err) => {
            console.warn('[Logger] Application log file transport error:', err.message);
        });
        const errorRotateTransport = new winston_daily_rotate_file_1.default({
            filename: path_1.default.join(logsDir, 'error-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '90d',
            level: 'error'
        });
        errorRotateTransport.on('error', (err) => {
            console.warn('[Logger] Error log file transport error:', err.message);
        });
        const auditRotateTransport = new winston_daily_rotate_file_1.default({
            filename: path_1.default.join(logsDir, 'audit-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '90d',
            level: 'info'
        });
        auditRotateTransport.on('error', (err) => {
            console.warn('[Logger] Audit log file transport error:', err.message);
        });
        mainTransports.push(appRotateTransport, errorRotateTransport);
        auditTransports.push(auditRotateTransport);
    }
    catch (err) {
        console.warn('[Logger] Daily rotate file transports skipped:', err?.message || err);
    }
}
exports.logger = winston_1.default.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: logFormat,
    defaultMeta: { service: 'autosuite-erp' },
    transports: mainTransports
});
exports.auditLogger = winston_1.default.createLogger({
    level: 'info',
    format: logFormat,
    defaultMeta: { service: 'autosuite-audit' },
    transports: auditTransports
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
