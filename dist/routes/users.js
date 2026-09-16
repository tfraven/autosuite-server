"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_js_1 = require("../lib/prisma.js");
const auth_js_1 = require("../middleware/auth.js");
const router = (0, express_1.Router)();
// All routes here require Admin role
router.use(auth_js_1.authenticateToken);
router.use((0, auth_js_1.requireRole)(['Admin']));
// GET /api/users
router.get('/', async (_req, res) => {
    try {
        const users = await prisma_js_1.prisma.user.findMany({
            select: {
                id: true,
                username: true,
                name: true,
                email: true,
                active: true,
                createdAt: true,
                role: {
                    select: {
                        id: true,
                        name: true,
                        description: true,
                        permissions: {
                            select: {
                                permission: true
                            }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        const formatted = users.map((u) => ({
            id: u.id,
            username: u.username,
            name: u.name,
            email: u.email,
            active: u.active,
            createdAt: u.createdAt,
            role: {
                id: u.role.id,
                name: u.role.name,
                description: u.role.description,
                permissions: u.role.permissions.map((rp) => rp.permission.name)
            }
        }));
        res.json(formatted);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});
// POST /api/users
router.post('/', async (req, res) => {
    try {
        const { username, name, email, password, roleId } = req.body;
        if (!username || !email || !password || !roleId) {
            res.status(400).json({ error: 'Missing required user fields' });
            return;
        }
        const existing = await prisma_js_1.prisma.user.findFirst({
            where: {
                OR: [{ username }, { email }]
            }
        });
        if (existing) {
            res.status(400).json({ error: 'Username or email already exists' });
            return;
        }
        const passwordHash = await bcryptjs_1.default.hash(password, 10);
        const user = await prisma_js_1.prisma.user.create({
            data: {
                username,
                name: name || username,
                email,
                passwordHash,
                roleId,
                active: true
            },
            include: {
                role: true
            }
        });
        await (0, auth_js_1.logAuditEvent)(req.user?.userId, 'CREATE_USER', 'USERS', `Created user ${user.username}`, req.ip);
        res.status(201).json({
            id: user.id,
            username: user.username,
            name: user.name,
            email: user.email,
            role: user.role.name
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create user' });
    }
});
// PUT /api/users/:id
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, roleId, active, password } = req.body;
        const data = {};
        if (name !== undefined)
            data.name = name;
        if (email !== undefined)
            data.email = email;
        if (roleId !== undefined)
            data.roleId = roleId;
        if (active !== undefined)
            data.active = active;
        if (password) {
            data.passwordHash = await bcryptjs_1.default.hash(password, 10);
        }
        const updated = await prisma_js_1.prisma.user.update({
            where: { id },
            data,
            include: { role: true }
        });
        await (0, auth_js_1.logAuditEvent)(req.user?.userId, 'UPDATE_USER', 'USERS', `Updated user ${updated.username}`, req.ip);
        res.json({
            id: updated.id,
            username: updated.username,
            name: updated.name,
            email: updated.email,
            active: updated.active,
            role: updated.role.name
        });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to update user' });
    }
});
// DELETE /api/users/:id
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (req.user?.userId === id) {
            res.status(400).json({ error: 'Cannot delete current logged-in user' });
            return;
        }
        const deleted = await prisma_js_1.prisma.user.delete({ where: { id } });
        await (0, auth_js_1.logAuditEvent)(req.user?.userId, 'DELETE_USER', 'USERS', `Deleted user ${deleted.username}`, req.ip);
        res.json({ message: 'User deleted successfully' });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to delete user' });
    }
});
// GET /api/users/roles
router.get('/roles/all', async (_req, res) => {
    try {
        const roles = await prisma_js_1.prisma.role.findMany({
            include: {
                permissions: {
                    include: {
                        permission: true
                    }
                },
                _count: {
                    select: { users: true }
                }
            }
        });
        const formatted = roles.map((r) => ({
            id: r.id,
            name: r.name,
            description: r.description,
            isSystem: r.isSystem,
            userCount: r._count.users,
            permissions: r.permissions.map((p) => ({
                id: p.permission.id,
                name: p.permission.name,
                module: p.permission.module,
                description: p.permission.description
            }))
        }));
        res.json(formatted);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to fetch roles' });
    }
});
// POST /api/users/roles
router.post('/roles', async (req, res) => {
    try {
        const { name, description, permissionIds } = req.body;
        if (!name) {
            res.status(400).json({ error: 'Role name is required' });
            return;
        }
        const role = await prisma_js_1.prisma.role.create({
            data: {
                name,
                description,
                permissions: {
                    create: (permissionIds || []).map((pId) => ({
                        permission: { connect: { id: pId } }
                    }))
                }
            },
            include: {
                permissions: {
                    include: { permission: true }
                }
            }
        });
        await (0, auth_js_1.logAuditEvent)(req.user?.userId, 'CREATE_ROLE', 'RBAC', `Created custom role ${name}`, req.ip);
        res.status(201).json(role);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to create role' });
    }
});
// PUT /api/users/roles/:id
router.put('/roles/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, permissionIds } = req.body;
        const role = await prisma_js_1.prisma.role.findUnique({ where: { id } });
        if (!role) {
            res.status(404).json({ error: 'Role not found' });
            return;
        }
        // Update role details
        await prisma_js_1.prisma.role.update({
            where: { id },
            data: {
                name: name || role.name,
                description: description !== undefined ? description : role.description
            }
        });
        // Update permissions if provided
        if (permissionIds && Array.isArray(permissionIds)) {
            // Clear existing
            await prisma_js_1.prisma.rolePermission.deleteMany({ where: { roleId: id } });
            // Insert new
            await prisma_js_1.prisma.rolePermission.createMany({
                data: permissionIds.map((pId) => ({
                    roleId: id,
                    permissionId: pId
                }))
            });
        }
        await (0, auth_js_1.logAuditEvent)(req.user?.userId, 'UPDATE_ROLE', 'RBAC', `Updated role ${role.name}`, req.ip);
        res.json({ message: 'Role updated successfully' });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to update role' });
    }
});
// GET /api/users/permissions/all
router.get('/permissions/all', async (_req, res) => {
    try {
        const permissions = await prisma_js_1.prisma.permission.findMany({
            orderBy: [{ module: 'asc' }, { name: 'asc' }]
        });
        res.json(permissions);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to fetch permissions' });
    }
});
exports.default = router;
