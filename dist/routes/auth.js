"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_js_1 = require("../lib/prisma.js");
const jwt_js_1 = require("../lib/jwt.js");
const auth_js_1 = require("../middleware/auth.js");
const router = (0, express_1.Router)();
// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            res.status(400).json({ error: 'Username and password are required' });
            return;
        }
        const user = await prisma_js_1.prisma.user.findUnique({
            where: { username },
            include: {
                role: {
                    include: {
                        permissions: {
                            include: {
                                permission: true
                            }
                        }
                    }
                }
            }
        });
        if (!user || !user.active) {
            res.status(401).json({ error: 'Invalid username or password' });
            return;
        }
        const isMatch = await bcryptjs_1.default.compare(password, user.passwordHash);
        if (!isMatch) {
            res.status(401).json({ error: 'Invalid username or password' });
            return;
        }
        const permissions = user.role.permissions.map((rp) => rp.permission.name);
        const tokenPayload = {
            userId: user.id,
            username: user.username,
            roleId: user.role.id,
            roleName: user.role.name,
            permissions
        };
        const accessToken = (0, jwt_js_1.generateAccessToken)(tokenPayload);
        const refreshToken = (0, jwt_js_1.generateRefreshToken)({ userId: user.id });
        await (0, auth_js_1.logAuditEvent)(user.id, 'LOGIN', 'AUTH', `User ${user.username} logged in successfully`, req.ip);
        res.json({
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                email: user.email,
                role: user.role.name,
                permissions
            }
        });
    }
    catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Internal server error during login' });
    }
});
// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            res.status(400).json({ error: 'Refresh token required' });
            return;
        }
        const payload = (0, jwt_js_1.verifyRefreshToken)(refreshToken);
        if (!payload) {
            res.status(403).json({ error: 'Invalid or expired refresh token' });
            return;
        }
        const user = await prisma_js_1.prisma.user.findUnique({
            where: { id: payload.userId },
            include: {
                role: {
                    include: {
                        permissions: {
                            include: {
                                permission: true
                            }
                        }
                    }
                }
            }
        });
        if (!user || !user.active) {
            res.status(401).json({ error: 'User inactive or not found' });
            return;
        }
        const permissions = user.role.permissions.map((rp) => rp.permission.name);
        const tokenPayload = {
            userId: user.id,
            username: user.username,
            roleId: user.role.id,
            roleName: user.role.name,
            permissions
        };
        const newAccessToken = (0, jwt_js_1.generateAccessToken)(tokenPayload);
        const newRefreshToken = (0, jwt_js_1.generateRefreshToken)({ userId: user.id });
        res.json({
            accessToken: newAccessToken,
            refreshToken: newRefreshToken
        });
    }
    catch (err) {
        console.error('Refresh token error:', err);
        res.status(500).json({ error: 'Failed to refresh token' });
    }
});
// GET /api/auth/me
router.get('/me', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.userId;
        const user = await prisma_js_1.prisma.user.findUnique({
            where: { id: userId },
            include: {
                role: {
                    include: {
                        permissions: {
                            include: {
                                permission: true
                            }
                        }
                    }
                }
            }
        });
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        const permissions = user.role.permissions.map((rp) => rp.permission.name);
        res.json({
            id: user.id,
            username: user.username,
            name: user.name,
            email: user.email,
            role: user.role.name,
            permissions
        });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to fetch user profile' });
    }
});
exports.default = router;
