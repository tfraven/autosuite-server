"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_js_1 = require("../lib/prisma.js");
const auth_js_1 = require("../middleware/auth.js");
const validate_js_1 = require("../middleware/validate.js");
const schemas_js_1 = require("../validation/schemas.js");
const router = (0, express_1.Router)();
// All routes here require Admin role
router.use(auth_js_1.authenticateToken);
router.use((0, auth_js_1.requireRole)(['Admin']));
// GET /api/users - List users with optional pagination
router.get('/', async (req, res) => {
    try {
        const { page, limit = '20', search, includeDeleted } = req.query;
        const where = {};
        if (includeDeleted !== 'true') {
            where.isDeleted = false;
        }
        if (search) {
            const q = String(search).trim();
            where.OR = [
                { username: { contains: q, mode: 'insensitive' } },
                { name: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } }
            ];
        }
        const totalCount = await prisma_js_1.prisma.user.count({ where });
        const queryOptions = {
            where,
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
        };
        if (page) {
            const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
            const limitNum = Math.max(1, parseInt(String(limit), 10) || 20);
            queryOptions.skip = (pageNum - 1) * limitNum;
            queryOptions.take = limitNum;
            const users = (await prisma_js_1.prisma.user.findMany(queryOptions));
            const formatted = users.map((u) => ({
                id: u.id,
                username: u.username,
                name: u.name,
                email: u.email,
                active: u.active,
                createdAt: u.createdAt,
                role: {
                    id: u.role?.id,
                    name: u.role?.name,
                    description: u.role?.description,
                    permissions: (u.role?.permissions || []).map((rp) => rp.permission?.name)
                }
            }));
            const totalPages = Math.ceil(totalCount / limitNum);
            res.json({
                data: formatted,
                users: formatted,
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
        const users = (await prisma_js_1.prisma.user.findMany(queryOptions));
        const formatted = users.map((u) => ({
            id: u.id,
            username: u.username,
            name: u.name,
            email: u.email,
            active: u.active,
            createdAt: u.createdAt,
            role: {
                id: u.role?.id,
                name: u.role?.name,
                description: u.role?.description,
                permissions: (u.role?.permissions || []).map((rp) => rp.permission?.name)
            }
        }));
        res.setHeader('X-Total-Count', totalCount.toString());
        res.json(formatted);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});
// POST /api/users - Create new user account
router.post('/', (0, validate_js_1.validateBody)(schemas_js_1.createUserSchema), async (req, res) => {
    try {
        const { username, name, email, password, roleId } = req.body;
        const existing = await prisma_js_1.prisma.user.findFirst({
            where: {
                OR: [{ username }, { email }],
                isDeleted: false
            }
        });
        if (existing) {
            res.status(409).json({ error: 'Username or email is already in use by an active user' });
            return;
        }
        const passwordHash = await bcryptjs_1.default.hash(password, 10);
        const user = await prisma_js_1.prisma.user.create({
            data: {
                username: username.toLowerCase(),
                name: name || username,
                email: email.toLowerCase(),
                passwordHash,
                roleId,
                active: true,
                isDeleted: false
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
// PUT /api/users/:id - Update user account
router.put('/:id', (0, validate_js_1.validateBody)(schemas_js_1.updateUserSchema), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, roleId, active, password } = req.body;
        const existing = await prisma_js_1.prisma.user.findUnique({ where: { id } });
        if (!existing || existing.isDeleted) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        const data = {};
        if (name !== undefined)
            data.name = name;
        if (email !== undefined)
            data.email = email.toLowerCase();
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
// DELETE /api/users/:id - Soft delete user
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (req.user?.userId === id) {
            res.status(400).json({ error: 'Cannot delete current logged-in account' });
            return;
        }
        const user = await prisma_js_1.prisma.user.findUnique({ where: { id } });
        if (!user || user.isDeleted) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        await prisma_js_1.prisma.user.update({
            where: { id },
            data: {
                isDeleted: true,
                deletedAt: new Date(),
                active: false
            }
        });
        await (0, auth_js_1.logAuditEvent)(req.user?.userId, 'SOFT_DELETE_USER', 'USERS', `Soft deleted user ${user.username}`, req.ip);
        res.json({ message: 'User soft deleted successfully', id });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to delete user' });
    }
});
// POST /api/users/:id/restore - Restore soft deleted user
router.post('/:id/restore', async (req, res) => {
    try {
        const { id } = req.params;
        const user = await prisma_js_1.prisma.user.findUnique({ where: { id } });
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        const restored = await prisma_js_1.prisma.user.update({
            where: { id },
            data: {
                isDeleted: false,
                deletedAt: null,
                active: true
            }
        });
        res.json({ message: 'User restored successfully', user: restored });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to restore user' });
    }
});
// GET /api/users/roles/all
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
router.post('/roles', (0, validate_js_1.validateBody)(schemas_js_1.createRoleSchema), async (req, res) => {
    try {
        const { name, description, permissionIds } = req.body;
        const role = await prisma_js_1.prisma.role.create({
            data: {
                name,
                description: description || null,
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
            await prisma_js_1.prisma.rolePermission.deleteMany({ where: { roleId: id } });
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
