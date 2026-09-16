"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_js_1 = require("../lib/prisma.js");
const auth_js_1 = require("../middleware/auth.js");
const router = (0, express_1.Router)();
router.use(auth_js_1.authenticateToken);
// GET /api/bikes - list bikes with filters
router.get('/', async (req, res) => {
    try {
        const { type, status, marketTarget, search } = req.query;
        const where = {};
        if (type)
            where.type = String(type);
        if (status)
            where.status = String(status);
        if (marketTarget)
            where.marketTarget = String(marketTarget);
        if (search) {
            const q = String(search).trim();
            where.OR = [
                { modelName: { contains: q } },
                { chassisNumber: { contains: q } },
                { engineNumber: { contains: q } },
                { registrationNumber: { contains: q } },
                { batchNumber: { contains: q } }
            ];
        }
        const bikes = await prisma_js_1.prisma.bike.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: {
                sales: {
                    select: {
                        id: true,
                        invoiceNumber: true,
                        customerName: true,
                        saleDate: true
                    },
                    take: 1
                }
            }
        });
        res.json(bikes);
    }
    catch (err) {
        console.error('Error fetching bikes:', err);
        res.status(500).json({ error: 'Failed to fetch bikes' });
    }
});
// GET /api/bikes/search-chassis/:chassis - fast lookup for sales entry
router.get('/search-chassis/:chassis', async (req, res) => {
    try {
        const { chassis } = req.params;
        const bike = await prisma_js_1.prisma.bike.findFirst({
            where: {
                chassisNumber: {
                    contains: chassis
                },
                status: 'IN_STOCK'
            }
        });
        if (!bike) {
            res.status(404).json({ error: 'No available in-stock motorcycle found with this chassis number' });
            return;
        }
        res.json(bike);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to lookup chassis number' });
    }
});
// GET /api/bikes/:id
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const bike = await prisma_js_1.prisma.bike.findUnique({
            where: { id },
            include: {
                sales: {
                    include: {
                        createdBy: { select: { name: true, username: true } },
                        documents: true
                    }
                }
            }
        });
        if (!bike) {
            res.status(404).json({ error: 'Bike not found' });
            return;
        }
        res.json(bike);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to fetch bike details' });
    }
});
// POST /api/bikes - create bike (Admin or MANAGE_BIKES)
router.post('/', (0, auth_js_1.requirePermission)('MANAGE_BIKES'), async (req, res) => {
    try {
        const { type, modelName, engineNumber, chassisNumber, color, modelYear, batchNumber, dealerInvoicePrice, retailPrice, status, marketTarget, registrationNumber, prevOwnerName, prevOwnerPhone, prevOwnerCnic, conditionGrade, purchaseCost, refurbishmentCost, expectedSellingPrice, notes } = req.body;
        if (!modelName || !engineNumber || !chassisNumber || !color || !modelYear) {
            res.status(400).json({ error: 'Missing essential bike details (Model, Engine, Chassis, Color, Year)' });
            return;
        }
        const existing = await prisma_js_1.prisma.bike.findFirst({
            where: {
                OR: [
                    { engineNumber: engineNumber.trim() },
                    { chassisNumber: chassisNumber.trim() }
                ]
            }
        });
        if (existing) {
            res.status(400).json({ error: 'A motorcycle with this Engine or Chassis number already exists' });
            return;
        }
        const bike = await prisma_js_1.prisma.bike.create({
            data: {
                type: type || 'BRAND_NEW',
                modelName: modelName.trim(),
                engineNumber: engineNumber.trim(),
                chassisNumber: chassisNumber.trim(),
                color: color.trim(),
                modelYear: Number(modelYear),
                batchNumber: batchNumber?.trim() || null,
                dealerInvoicePrice: Number(dealerInvoicePrice) || 0,
                retailPrice: Number(retailPrice) || 0,
                status: status || 'IN_STOCK',
                marketTarget: marketTarget || 'BOTH',
                registrationNumber: registrationNumber?.trim() || null,
                prevOwnerName: prevOwnerName?.trim() || null,
                prevOwnerPhone: prevOwnerPhone?.trim() || null,
                prevOwnerCnic: prevOwnerCnic?.trim() || null,
                conditionGrade: conditionGrade || null,
                purchaseCost: Number(purchaseCost) || 0,
                refurbishmentCost: Number(refurbishmentCost) || 0,
                expectedSellingPrice: Number(expectedSellingPrice) || 0,
                notes: notes?.trim() || null
            }
        });
        await (0, auth_js_1.logAuditEvent)(req.user?.userId, 'CREATE_BIKE', 'INVENTORY', `Added ${bike.type} bike: ${bike.modelName} (Chassis: ${bike.chassisNumber})`, req.ip);
        res.status(201).json(bike);
    }
    catch (err) {
        console.error('Error creating bike:', err);
        res.status(500).json({ error: 'Failed to create bike record' });
    }
});
// PUT /api/bikes/:id
router.put('/:id', (0, auth_js_1.requirePermission)('MANAGE_BIKES'), async (req, res) => {
    try {
        const { id } = req.params;
        const body = req.body;
        const existing = await prisma_js_1.prisma.bike.findUnique({ where: { id } });
        if (!existing) {
            res.status(404).json({ error: 'Bike not found' });
            return;
        }
        const updated = await prisma_js_1.prisma.bike.update({
            where: { id },
            data: {
                type: body.type !== undefined ? body.type : existing.type,
                modelName: body.modelName !== undefined ? body.modelName.trim() : existing.modelName,
                engineNumber: body.engineNumber !== undefined ? body.engineNumber.trim() : existing.engineNumber,
                chassisNumber: body.chassisNumber !== undefined ? body.chassisNumber.trim() : existing.chassisNumber,
                color: body.color !== undefined ? body.color.trim() : existing.color,
                modelYear: body.modelYear !== undefined ? Number(body.modelYear) : existing.modelYear,
                batchNumber: body.batchNumber !== undefined ? body.batchNumber?.trim() : existing.batchNumber,
                dealerInvoicePrice: body.dealerInvoicePrice !== undefined ? Number(body.dealerInvoicePrice) : existing.dealerInvoicePrice,
                retailPrice: body.retailPrice !== undefined ? Number(body.retailPrice) : existing.retailPrice,
                status: body.status !== undefined ? body.status : existing.status,
                marketTarget: body.marketTarget !== undefined ? body.marketTarget : existing.marketTarget,
                registrationNumber: body.registrationNumber !== undefined ? body.registrationNumber?.trim() : existing.registrationNumber,
                prevOwnerName: body.prevOwnerName !== undefined ? body.prevOwnerName?.trim() : existing.prevOwnerName,
                prevOwnerPhone: body.prevOwnerPhone !== undefined ? body.prevOwnerPhone?.trim() : existing.prevOwnerPhone,
                prevOwnerCnic: body.prevOwnerCnic !== undefined ? body.prevOwnerCnic?.trim() : existing.prevOwnerCnic,
                conditionGrade: body.conditionGrade !== undefined ? body.conditionGrade : existing.conditionGrade,
                purchaseCost: body.purchaseCost !== undefined ? Number(body.purchaseCost) : existing.purchaseCost,
                refurbishmentCost: body.refurbishmentCost !== undefined ? Number(body.refurbishmentCost) : existing.refurbishmentCost,
                expectedSellingPrice: body.expectedSellingPrice !== undefined ? Number(body.expectedSellingPrice) : existing.expectedSellingPrice,
                notes: body.notes !== undefined ? body.notes?.trim() : existing.notes
            }
        });
        await (0, auth_js_1.logAuditEvent)(req.user?.userId, 'UPDATE_BIKE', 'INVENTORY', `Updated bike ${updated.modelName} (Chassis: ${updated.chassisNumber})`, req.ip);
        res.json(updated);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to update bike record' });
    }
});
// DELETE /api/bikes/:id
router.delete('/:id', (0, auth_js_1.requirePermission)('MANAGE_BIKES'), async (req, res) => {
    try {
        const { id } = req.params;
        const bike = await prisma_js_1.prisma.bike.findUnique({
            where: { id },
            include: { sales: true }
        });
        if (!bike) {
            res.status(404).json({ error: 'Bike not found' });
            return;
        }
        if (bike.sales && bike.sales.length > 0) {
            res.status(400).json({ error: 'Cannot delete bike with associated sales records. Change its status instead.' });
            return;
        }
        await prisma_js_1.prisma.bike.delete({ where: { id } });
        await (0, auth_js_1.logAuditEvent)(req.user?.userId, 'DELETE_BIKE', 'INVENTORY', `Deleted bike ${bike.modelName} (Chassis: ${bike.chassisNumber})`, req.ip);
        res.json({ message: 'Bike deleted successfully' });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to delete bike' });
    }
});
exports.default = router;
