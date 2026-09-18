"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const dotenv_1 = __importDefault(require("dotenv"));
const prisma_js_1 = require("./lib/prisma.js");
const logger_js_1 = require("./lib/logger.js");
const errorHandler_js_1 = require("./middleware/errorHandler.js");
const auth_js_1 = __importDefault(require("./routes/auth.js"));
const users_js_1 = __importDefault(require("./routes/users.js"));
const bikes_js_1 = __importDefault(require("./routes/bikes.js"));
const sales_js_1 = __importDefault(require("./routes/sales.js"));
const customers_js_1 = __importDefault(require("./routes/customers.js"));
const vendors_js_1 = __importDefault(require("./routes/vendors.js"));
const documents_js_1 = __importDefault(require("./routes/documents.js"));
const parts_js_1 = __importDefault(require("./routes/parts.js"));
const reports_js_1 = __importDefault(require("./routes/reports.js"));
const audit_js_1 = __importDefault(require("./routes/audit.js"));
const settings_js_1 = __importDefault(require("./routes/settings.js"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
const isProd = process.env.NODE_ENV === 'production';
// Security Headers with Helmet
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: isProd ? undefined : false
}));
// CORS configuration
const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : ['http://localhost:5173', 'http://localhost:5000', 'http://127.0.0.1:5173', 'http://127.0.0.1:5000'];
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*') || !isProd) {
            callback(null, true);
        }
        else {
            callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
// Body parsing with size limits
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// Request logger (logs to console and 90-day rotating files)
app.use(logger_js_1.requestLogger);
// Global API Rate Limiter
const generalApiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // max 1000 requests per 15 minutes per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests from this IP, please try again after 15 minutes.' }
});
app.use('/api', generalApiLimiter);
// Strict Auth Rate Limiter (brute-force defense)
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 20, // max 20 login attempts per 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts. Please try again after 15 minutes.' }
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/change-password', authLimiter);
// API Routes
app.use('/api/auth', auth_js_1.default);
app.use('/api/users', users_js_1.default);
app.use('/api/bikes', bikes_js_1.default);
app.use('/api/sales', sales_js_1.default);
app.use('/api/customers', customers_js_1.default);
app.use('/api/vendors', vendors_js_1.default);
app.use('/api/documents', documents_js_1.default);
app.use('/api/parts', parts_js_1.default);
app.use('/api/reports', reports_js_1.default);
app.use('/api/audit-logs', audit_js_1.default);
app.use('/api/settings', settings_js_1.default);
// Health Check with Database Status & System Telemetry
app.get('/api/health', async (_req, res) => {
    const startTime = Date.now();
    let dbStatus = 'healthy';
    let dbLatencyMs = 0;
    try {
        const dbStart = Date.now();
        await prisma_js_1.prisma.$queryRaw `SELECT 1`;
        dbLatencyMs = Date.now() - dbStart;
    }
    catch (err) {
        dbStatus = 'unreachable';
    }
    const memoryUsage = process.memoryUsage();
    res.json({
        status: dbStatus === 'healthy' ? 'ok' : 'degraded',
        service: 'AutoSuite ERP Server',
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
        database: {
            status: dbStatus,
            latencyMs: dbLatencyMs
        },
        memory: {
            rssMb: Math.round(memoryUsage.rss / 1024 / 1024),
            heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
            heapTotalMb: Math.round(memoryUsage.heapTotal / 1024 / 1024)
        },
        systemCheckDurationMs: Date.now() - startTime
    });
});
// Centralized Error Handler Middleware
app.use(errorHandler_js_1.errorHandler);
const server = app.listen(PORT, () => {
    logger_js_1.logger.info(`AutoSuite ERP Server running on http://localhost:${PORT}`);
});
// Graceful Shutdown Handling
const shutdown = async (signal) => {
    logger_js_1.logger.info(`Received ${signal}, shutting down gracefully...`);
    server.close(async () => {
        try {
            await prisma_js_1.prisma.$disconnect();
            logger_js_1.logger.info('Database disconnected. Process exiting.');
            process.exit(0);
        }
        catch (err) {
            logger_js_1.logger.error('Error during database disconnect:', err);
            process.exit(1);
        }
    });
    // Force exit after 10s if hanging
    setTimeout(() => {
        logger_js_1.logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
exports.default = app;
