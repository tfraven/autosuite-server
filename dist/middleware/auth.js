"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateToken = authenticateToken;
exports.requireRole = requireRole;
exports.requirePermission = requirePermission;
exports.logAuditEvent = logAuditEvent;
const jwt_js_1 = require("../lib/jwt.js");
const prisma_js_1 = require("../lib/prisma.js");
async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        res.status(401).json({ error: 'Access token required' });
        return;
    }
    const payload = (0, jwt_js_1.verifyAccessToken)(token);
    if (!payload) {
        res.status(403).json({ error: 'Invalid or expired access token' });
        return;
    }
    // Verify that the user still exists in the database, is active, and not deleted
    const user = await prisma_js_1.prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, active: true, isDeleted: true }
    });
    if (!user || !user.active || user.isDeleted) {
        res.status(401).json({ error: 'Account is deactivated, deleted, or does not exist' });
        return;
    }
    req.user = payload;
    next();
}
function requireRole(allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        if (!allowedRoles.includes(req.user.roleName)) {
            res.status(403).json({
                error: `Forbidden: role '${req.user.roleName}' does not have access to this resource`
            });
            return;
        }
        next();
    };
}
function requirePermission(permissionName) {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        // Admin role bypasses granular permission checks
        if (req.user.roleName === 'Admin') {
            next();
            return;
        }
        if (!req.user.permissions || !req.user.permissions.includes(permissionName)) {
            res.status(403).json({
                error: `Forbidden: missing permission '${permissionName}'`
            });
            return;
        }
        next();
    };
}
async function logAuditEvent(userId, action, module, details, ipAddress) {
    try {
        await prisma_js_1.prisma.auditLog.create({
            data: {
                userId: userId || null,
                action,
                module,
                details,
                ipAddress: ipAddress || '127.0.0.1'
            }
        });
    }
    catch (err) {
        console.error('Failed to write audit log:', err);
    }
}
