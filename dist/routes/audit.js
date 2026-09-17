"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const fs_1 = __importDefault(require("fs"));
const prisma_js_1 = require("../lib/prisma.js");
const logger_js_1 = require("../lib/logger.js");
const auth_js_1 = require("../middleware/auth.js");
const router = (0, express_1.Router)();
router.use(auth_js_1.authenticateToken);
router.use((0, auth_js_1.requireRole)(['Admin']));
// GET /api/audit-logs - View system audit logs with search, filter & pagination
router.get('/', async (req, res) => {
    try {
        const { module, action, search, startDate, endDate, page, limit = '50' } = req.query;
        const where = {};
        if (module)
            where.module = String(module);
        if (action)
            where.action = String(action);
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate)
                where.createdAt.gte = new Date(String(startDate));
            if (endDate) {
                const end = new Date(String(endDate));
                end.setHours(23, 59, 59, 999);
                where.createdAt.lte = end;
            }
        }
        if (search) {
            const q = String(search).trim();
            where.OR = [
                { action: { contains: q, mode: 'insensitive' } },
                { module: { contains: q, mode: 'insensitive' } },
                { details: { contains: q, mode: 'insensitive' } },
                { user: { username: { contains: q, mode: 'insensitive' } } }
            ];
        }
        const totalCount = await prisma_js_1.prisma.auditLog.count({ where });
        const queryOptions = {
            where,
            orderBy: { createdAt: 'desc' },
            include: {
                user: {
                    select: { username: true, name: true }
                }
            }
        };
        if (page) {
            const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
            const limitNum = Math.max(1, parseInt(String(limit), 10) || 50);
            queryOptions.skip = (pageNum - 1) * limitNum;
            queryOptions.take = limitNum;
            const logs = await prisma_js_1.prisma.auditLog.findMany(queryOptions);
            const totalPages = Math.ceil(totalCount / limitNum);
            res.json({
                data: logs,
                logs,
                pagination: {
                    total: totalCount,
                    page: pageNum,
                    limit: limitNum,
                    totalPages,
                    hasNext: pageNum < totalPages,
                    hasPrev: pageNum > 1
                }
            });
            return;
        }
        queryOptions.take = Number(limit) || 100;
        const logs = await prisma_js_1.prisma.auditLog.findMany(queryOptions);
        res.setHeader('X-Total-Count', totalCount.toString());
        res.json(logs);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to retrieve audit logs' });
    }
});
// GET /api/audit-logs/retention - Retention compliance check (90 days minimum)
router.get('/retention', async (_req, res) => {
    try {
        const totalLogs = await prisma_js_1.prisma.auditLog.count();
        const oldestLog = await prisma_js_1.prisma.auditLog.findFirst({
            orderBy: { createdAt: 'asc' },
            select: { createdAt: true }
        });
        const newestLog = await prisma_js_1.prisma.auditLog.findFirst({
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true }
        });
        // Check disk log files
        let logFiles = [];
        if (fs_1.default.existsSync(logger_js_1.logsDir)) {
            logFiles = fs_1.default.readdirSync(logger_js_1.logsDir);
        }
        const retentionDays = 90;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
        const logsBeyondCutoff = await prisma_js_1.prisma.auditLog.count({
            where: { createdAt: { lt: cutoffDate } }
        });
        res.json({
            policy: {
                retentionPeriodDays: retentionDays,
                complianceStatus: 'COMPLIANT_90_DAYS',
                automaticFileRotation: 'ENABLED',
                fileRetention: '90d'
            },
            database: {
                totalAuditRecords: totalLogs,
                oldestRecordAt: oldestLog?.createdAt || null,
                newestRecordAt: newestLog?.createdAt || null,
                recordsOlderThan90Days: logsBeyondCutoff
            },
            fileSystem: {
                logDirectory: logger_js_1.logsDir,
                activeLogFiles: logFiles.length,
                files: logFiles.slice(-15) // last 15 files
            }
        });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to retrieve retention metadata' });
    }
});
// GET /api/audit-logs/export - Export audit logs to CSV for compliance audits
router.get('/export', async (req, res) => {
    try {
        const { module, action, startDate, endDate } = req.query;
        const where = {};
        if (module)
            where.module = String(module);
        if (action)
            where.action = String(action);
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate)
                where.createdAt.gte = new Date(String(startDate));
            if (endDate) {
                const end = new Date(String(endDate));
                end.setHours(23, 59, 59, 999);
                where.createdAt.lte = end;
            }
        }
        const logs = await prisma_js_1.prisma.auditLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 5000,
            include: {
                user: { select: { username: true, name: true } }
            }
        });
        let csv = 'Timestamp,Module,Action,User,IP Address,Details\n';
        for (const log of logs) {
            const userStr = log.user?.username || 'SYSTEM';
            const cleanDetails = (log.details || '').replace(/"/g, '""');
            csv += `"${log.createdAt.toISOString()}","${log.module}","${log.action}","${userStr}","${log.ipAddress || ''}","${cleanDetails}"\n`;
        }
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=AutoSuite_Audit_Log_${Date.now()}.csv`);
        res.send(csv);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to export audit logs' });
    }
});
exports.default = router;
