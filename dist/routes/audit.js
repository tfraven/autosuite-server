"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_js_1 = require("../lib/prisma.js");
const auth_js_1 = require("../middleware/auth.js");
const router = (0, express_1.Router)();
router.use(auth_js_1.authenticateToken);
router.use((0, auth_js_1.requireRole)(['Admin']));
// GET /api/audit-logs - View system audit logs
router.get('/', async (req, res) => {
    try {
        const { module, action, limit = 100 } = req.query;
        const where = {};
        if (module)
            where.module = String(module);
        if (action)
            where.action = String(action);
        const logs = await prisma_js_1.prisma.auditLog.findMany({
            where,
            take: Number(limit),
            orderBy: { createdAt: 'desc' },
            include: {
                user: {
                    select: { username: true, name: true }
                }
            }
        });
        res.json(logs);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to retrieve audit logs' });
    }
});
exports.default = router;
