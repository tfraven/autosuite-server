"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_js_1 = require("../lib/prisma.js");
const auth_js_1 = require("../middleware/auth.js");
const validate_js_1 = require("../middleware/validate.js");
const schemas_js_1 = require("../validation/schemas.js");
const router = (0, express_1.Router)();
router.use(auth_js_1.authenticateToken);
// Helper for B2B Order Number (e.g. PO-B2B-2026-0001)
async function generateOrderNumber() {
    const count = await prisma_js_1.prisma.partOrder.count();
    const year = new Date().getFullYear();
    return `B2B-${year}-${String(count + 1).padStart(4, '0')}`;
}
// Helper for Vendor PO Number (e.g. VPO-2026-0001)
async function generateVpoNumber() {
    const count = await prisma_js_1.prisma.vendorPO.count();
    const year = new Date().getFullYear();
    return `VPO-${year}-${String(count + 1).padStart(4, '0')}`;
}
// GET /api/parts - List parts with search, category & pagination
router.get('/', (0, auth_js_1.requirePermission)('MANAGE_PARTS'), async (req, res) => {
    try {
        const { search, category, lowStockOnly, page, limit = '20', includeDeleted } = req.query;
        const where = {};
        if (includeDeleted !== 'true') {
            where.isDeleted = false;
        }
        if (category)
            where.category = String(category);
        if (search) {
            const q = String(search).trim();
            where.OR = [
                { partCode: { contains: q, mode: 'insensitive' } },
                { partName: { contains: q, mode: 'insensitive' } },
                { compatibilityModel: { contains: q, mode: 'insensitive' } }
            ];
        }
        const totalCount = await prisma_js_1.prisma.part.count({ where });
        const queryOptions = {
            where,
            orderBy: { partName: 'asc' }
        };
        if (page) {
            const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
            const limitNum = Math.max(1, parseInt(String(limit), 10) || 20);
            queryOptions.skip = (pageNum - 1) * limitNum;
            queryOptions.take = limitNum;
            const parts = await prisma_js_1.prisma.part.findMany(queryOptions);
            const filteredParts = lowStockOnly === 'true'
                ? parts.filter((p) => p.quantity <= p.reorderThreshold)
                : parts;
            const totalPages = Math.ceil(totalCount / limitNum);
            res.json({
                data: filteredParts,
                parts: filteredParts,
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
        const parts = await prisma_js_1.prisma.part.findMany(queryOptions);
        const results = lowStockOnly === 'true'
            ? parts.filter((p) => p.quantity <= p.reorderThreshold)
            : parts;
        res.setHeader('X-Total-Count', totalCount.toString());
        res.json(results);
    }
    catch (err) {
        console.error('Error fetching parts:', err);
        res.status(500).json({ error: 'Failed to fetch spare parts' });
    }
});
// GET /api/parts/alerts/low-stock - List low stock alerts
router.get('/alerts/low-stock', (0, auth_js_1.requirePermission)('MANAGE_PARTS'), async (_req, res) => {
    try {
        const allParts = await prisma_js_1.prisma.part.findMany({
            where: { isDeleted: false },
            orderBy: { quantity: 'asc' }
        });
        const lowStockParts = allParts.filter((p) => p.quantity <= p.reorderThreshold);
        res.json({
            count: lowStockParts.length,
            parts: lowStockParts
        });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to fetch low stock alerts' });
    }
});
// POST /api/parts - Add new part to catalog
router.post('/', (0, auth_js_1.requirePermission)('MANAGE_PARTS'), (0, validate_js_1.validateBody)(schemas_js_1.createPartSchema), async (req, res) => {
    try {
        const data = req.body;
        const existing = await prisma_js_1.prisma.part.findFirst({
            where: { partCode: data.partCode, isDeleted: false }
        });
        if (existing) {
            res.status(409).json({ error: `Part code '${data.partCode}' is already registered` });
            return;
        }
        const part = await prisma_js_1.prisma.part.create({
            data: {
                partCode: data.partCode,
                partName: data.partName,
                compatibilityModel: data.compatibilityModel,
                wholesaleCost: Number(data.wholesaleCost),
                b2bSellingPrice: Number(data.b2bSellingPrice),
                quantity: Number(data.quantity) || 0,
                reorderThreshold: Number(data.reorderThreshold) || 5,
                category: data.category || null,
                location: data.location || null,
                isDeleted: false
            }
        });
        await (0, auth_js_1.logAuditEvent)(req.user?.userId, 'CREATE_PART', 'SPARE_PARTS', `Registered spare part ${part.partName} [${part.partCode}]`, req.ip);
        res.status(201).json(part);
    }
    catch (err) {
        console.error('Error creating part:', err);
        res.status(500).json({ error: 'Failed to create spare part' });
    }
});
// PUT /api/parts/:id - Update part
router.put('/:id', (0, auth_js_1.requirePermission)('MANAGE_PARTS'), (0, validate_js_1.validateBody)(schemas_js_1.updatePartSchema), async (req, res) => {
    try {
        const { id } = req.params;
        const body = req.body;
        const existing = await prisma_js_1.prisma.part.findUnique({ where: { id } });
        if (!existing || existing.isDeleted) {
            res.status(404).json({ error: 'Part not found' });
            return;
        }
        const updated = await prisma_js_1.prisma.part.update({
            where: { id },
            data: {
                ...body,
                ...(body.wholesaleCost !== undefined ? { wholesaleCost: Number(body.wholesaleCost) } : {}),
                ...(body.b2bSellingPrice !== undefined ? { b2bSellingPrice: Number(body.b2bSellingPrice) } : {}),
                ...(body.quantity !== undefined ? { quantity: Number(body.quantity) } : {}),
                ...(body.reorderThreshold !== undefined ? { reorderThreshold: Number(body.reorderThreshold) } : {})
            }
        });
        res.json(updated);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to update part' });
    }
});
// DELETE /api/parts/:id - Soft Delete Part
router.delete('/:id', (0, auth_js_1.requirePermission)('MANAGE_PARTS'), async (req, res) => {
    try {
        const { id } = req.params;
        const part = await prisma_js_1.prisma.part.findUnique({ where: { id } });
        if (!part || part.isDeleted) {
            res.status(404).json({ error: 'Part not found' });
            return;
        }
        await prisma_js_1.prisma.part.update({
            where: { id },
            data: {
                isDeleted: true,
                deletedAt: new Date()
            }
        });
        await (0, auth_js_1.logAuditEvent)(req.user?.userId, 'SOFT_DELETE_PART', 'SPARE_PARTS', `Soft deleted spare part ${part.partName} (${part.partCode})`, req.ip);
        res.json({ message: 'Part soft deleted successfully', id });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to delete part' });
    }
});
// POST /api/parts/:id/restore - Restore soft deleted part
router.post('/:id/restore', (0, auth_js_1.requirePermission)('MANAGE_PARTS'), async (req, res) => {
    try {
        const { id } = req.params;
        const part = await prisma_js_1.prisma.part.findUnique({ where: { id } });
        if (!part) {
            res.status(404).json({ error: 'Part not found' });
            return;
        }
        await prisma_js_1.prisma.part.update({
            where: { id },
            data: {
                isDeleted: false,
                deletedAt: null
            }
        });
        res.json({ message: 'Part restored successfully', part });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to restore part' });
    }
});
// --- B2B Parts Orders ---
// GET /api/parts/orders/all - List B2B orders
router.get('/orders/all', (0, auth_js_1.requirePermission)('MANAGE_PARTS'), async (_req, res) => {
    try {
        const orders = await prisma_js_1.prisma.partOrder.findMany({
            where: { isDeleted: false },
            orderBy: { createdAt: 'desc' },
            include: {
                items: {
                    include: { part: true }
                }
            }
        });
        res.json(orders);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to fetch B2B parts orders' });
    }
});
// POST /api/parts/orders - Record B2B bulk parts order
router.post('/orders', (0, auth_js_1.requirePermission)('MANAGE_PARTS'), (0, validate_js_1.validateBody)(schemas_js_1.createPartOrderSchema), async (req, res) => {
    try {
        const { customerName, customerType, contactNumber, items, notes } = req.body;
        // Verify stock availability
        for (const item of items) {
            const part = await prisma_js_1.prisma.part.findUnique({ where: { id: item.partId } });
            if (!part || part.isDeleted) {
                res.status(404).json({ error: `Part with ID ${item.partId} not found` });
                return;
            }
            if (part.quantity < item.quantity) {
                res.status(400).json({
                    error: `Insufficient stock for part '${part.partName}'. Available: ${part.quantity}, Requested: ${item.quantity}`
                });
                return;
            }
        }
        const orderNumber = await generateOrderNumber();
        const order = await prisma_js_1.prisma.$transaction(async (tx) => {
            let totalAmount = 0;
            const orderItemsData = [];
            for (const item of items) {
                const part = await tx.part.findUniqueOrThrow({ where: { id: item.partId } });
                const unitPrice = Number(item.unitPrice) || part.b2bSellingPrice;
                const subtotal = unitPrice * Number(item.quantity);
                totalAmount += subtotal;
                // Decrement part inventory
                await tx.part.update({
                    where: { id: part.id },
                    data: {
                        quantity: { decrement: Number(item.quantity) }
                    }
                });
                orderItemsData.push({
                    partId: part.id,
                    quantity: Number(item.quantity),
                    unitPrice,
                    subtotal
                });
            }
            return tx.partOrder.create({
                data: {
                    orderNumber,
                    customerName: customerName.trim(),
                    customerType: customerType || 'SECONDARY_WORKSHOP',
                    contactNumber: contactNumber.trim(),
                    totalAmount,
                    status: 'COMPLETED',
                    notes: notes?.trim() || null,
                    isDeleted: false,
                    items: {
                        create: orderItemsData
                    }
                },
                include: {
                    items: { include: { part: true } }
                }
            });
        });
        await (0, auth_js_1.logAuditEvent)(req.user?.userId, 'CREATE_PARTS_ORDER', 'SPARE_PARTS', `Issued B2B Parts Order ${order.orderNumber} for ${customerName} (Total: ${order.totalAmount})`, req.ip);
        res.status(201).json(order);
    }
    catch (err) {
        console.error('Error creating B2B parts order:', err);
        res.status(500).json({ error: 'Failed to record parts order' });
    }
});
// DELETE /api/parts/orders/:id - Soft Delete Order
router.delete('/orders/:id', (0, auth_js_1.requirePermission)('MANAGE_PARTS'), async (req, res) => {
    try {
        const { id } = req.params;
        const order = await prisma_js_1.prisma.partOrder.findUnique({ where: { id } });
        if (!order || order.isDeleted) {
            res.status(404).json({ error: 'Order not found' });
            return;
        }
        await prisma_js_1.prisma.partOrder.update({
            where: { id },
            data: { isDeleted: true, deletedAt: new Date(), status: 'CANCELLED' }
        });
        res.json({ message: 'Parts order soft deleted successfully', id });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to delete order' });
    }
});
// --- Vendor Purchase Orders (PO) ---
// GET /api/parts/vendor-pos/all - List POs
router.get('/vendor-pos/all', (0, auth_js_1.requirePermission)('MANAGE_PARTS'), async (_req, res) => {
    try {
        const pos = await prisma_js_1.prisma.vendorPO.findMany({
            where: { isDeleted: false },
            orderBy: { createdAt: 'desc' },
            include: {
                items: {
                    include: { part: true }
                }
            }
        });
        res.json(pos);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to fetch vendor purchase orders' });
    }
});
// POST /api/parts/vendor-pos - Create Vendor PO
router.post('/vendor-pos', (0, auth_js_1.requirePermission)('MANAGE_PARTS'), (0, validate_js_1.validateBody)(schemas_js_1.createVendorPOSchema), async (req, res) => {
    try {
        const { vendorName, contactNumber, items, notes } = req.body;
        const poNumber = await generateVpoNumber();
        let totalAmount = 0;
        const poItemsData = [];
        for (const item of items) {
            const unitCost = Number(item.unitCost) || 0;
            const subtotal = unitCost * Number(item.quantityOrdered);
            totalAmount += subtotal;
            poItemsData.push({
                partId: item.partId,
                quantityOrdered: Number(item.quantityOrdered),
                quantityReceived: 0,
                unitCost,
                subtotal
            });
        }
        const po = await prisma_js_1.prisma.vendorPO.create({
            data: {
                poNumber,
                vendorName: vendorName.trim(),
                contactNumber: contactNumber?.trim() || null,
                status: 'ORDERED',
                orderedAt: new Date(),
                totalAmount,
                notes: notes?.trim() || null,
                isDeleted: false,
                items: {
                    create: poItemsData
                }
            },
            include: {
                items: { include: { part: true } }
            }
        });
        await (0, auth_js_1.logAuditEvent)(req.user?.userId, 'CREATE_VENDOR_PO', 'SPARE_PARTS', `Created Vendor Purchase Order ${po.poNumber} with ${vendorName}`, req.ip);
        res.status(201).json(po);
    }
    catch (err) {
        console.error('Error creating vendor PO:', err);
        res.status(500).json({ error: 'Failed to create vendor PO' });
    }
});
// PUT /api/parts/vendor-pos/:id/receive - Mark PO received and increment stock
router.put('/vendor-pos/:id/receive', (0, auth_js_1.requirePermission)('MANAGE_PARTS'), async (req, res) => {
    try {
        const { id } = req.params;
        const po = await prisma_js_1.prisma.vendorPO.findUnique({
            where: { id },
            include: { items: true }
        });
        if (!po || po.isDeleted) {
            res.status(404).json({ error: 'Purchase order not found' });
            return;
        }
        if (po.status === 'RECEIVED') {
            res.status(400).json({ error: 'Purchase order has already been received' });
            return;
        }
        const updated = await prisma_js_1.prisma.$transaction(async (tx) => {
            // Increment stock for each item in the PO
            for (const item of po.items) {
                await tx.part.update({
                    where: { id: item.partId },
                    data: {
                        quantity: { increment: item.quantityOrdered }
                    }
                });
                await tx.vendorPOItem.update({
                    where: { id: item.id },
                    data: {
                        quantityReceived: item.quantityOrdered
                    }
                });
            }
            return tx.vendorPO.update({
                where: { id },
                data: {
                    status: 'RECEIVED',
                    receivedAt: new Date()
                },
                include: {
                    items: { include: { part: true } }
                }
            });
        });
        await (0, auth_js_1.logAuditEvent)(req.user?.userId, 'RECEIVE_VENDOR_PO', 'SPARE_PARTS', `Received shipment for PO ${po.poNumber}, parts stock updated`, req.ip);
        res.json(updated);
    }
    catch (err) {
        console.error('Error receiving PO:', err);
        res.status(500).json({ error: 'Failed to process PO receipt' });
    }
});
// DELETE /api/parts/vendor-pos/:id - Soft delete PO
router.delete('/vendor-pos/:id', (0, auth_js_1.requirePermission)('MANAGE_PARTS'), async (req, res) => {
    try {
        const { id } = req.params;
        const po = await prisma_js_1.prisma.vendorPO.findUnique({ where: { id } });
        if (!po || po.isDeleted) {
            res.status(404).json({ error: 'Purchase order not found' });
            return;
        }
        await prisma_js_1.prisma.vendorPO.update({
            where: { id },
            data: { isDeleted: true, deletedAt: new Date(), status: 'CANCELLED' }
        });
        res.json({ message: 'Purchase order soft deleted successfully', id });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to delete PO' });
    }
});
exports.default = router;
