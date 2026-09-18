"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_js_1 = require("../lib/prisma.js");
const auth_js_1 = require("../middleware/auth.js");
const validate_js_1 = require("../middleware/validate.js");
const schemas_js_1 = require("../validation/schemas.js");
const router = (0, express_1.Router)();
router.use(auth_js_1.authenticateToken);
// Helper to format bike with normalized relations flattened for backwards compatibility
function formatBikeResponse(bike) {
    if (!bike)
        return null;
    const used = bike.usedDetail;
    return {
        ...bike,
        brand: bike.model?.brand || 'Atlas Honda',
        modelDisplacement: bike.model?.engineDisplacement || null,
        registrationNumber: used?.registrationNumber || null,
        prevOwnerName: used?.prevOwnerName || null,
        prevOwnerPhone: used?.prevOwnerPhone || null,
        prevOwnerCnic: used?.prevOwnerCnic || null,
        conditionGrade: used?.conditionGrade || null,
        purchaseCost: used?.purchaseCost || 0,
        refurbishmentCost: used?.refurbishmentCost || 0,
        expectedSellingPrice: used?.expectedSellingPrice || 0
    };
}
// GET /api/bikes/models/all - List all bike models catalog (3NF/BCNF)
router.get('/models/all', async (_req, res) => {
    try {
        const models = await prisma_js_1.prisma.bikeModel.findMany({
            where: { isDeleted: false },
            orderBy: [{ brand: 'asc' }, { name: 'asc' }],
            include: {
                _count: { select: { bikes: true } }
            }
        });
        res.json(models);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to retrieve bike models' });
    }
});
// POST /api/bikes/models - Add model to catalog
router.post('/models', (0, auth_js_1.requirePermission)('MANAGE_BIKES'), (0, validate_js_1.validateBody)(schemas_js_1.createBikeModelSchema), async (req, res) => {
    try {
        const { name, brand, engineDisplacement, defaultRetailPrice } = req.body;
        const existing = await prisma_js_1.prisma.bikeModel.findUnique({ where: { name: name.trim() } });
        if (existing) {
            res.status(409).json({ error: `Bike model '${name}' already exists in catalog` });
            return;
        }
        const model = await prisma_js_1.prisma.bikeModel.create({
            data: {
                name: name.trim(),
                brand: brand?.trim() || 'Atlas Honda',
                engineDisplacement: engineDisplacement?.trim() || null,
                defaultRetailPrice: Number(defaultRetailPrice) || 0
            }
        });
        res.status(201).json(model);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to create bike model' });
    }
});
// GET /api/bikes - list bikes with filters and optional pagination
router.get('/', async (req, res) => {
    try {
        const { type, status, marketTarget, search, page, limit = '20', includeDeleted } = req.query;
        const where = {};
        if (includeDeleted !== 'true') {
            where.isDeleted = false;
        }
        if (type)
            where.type = String(type);
        if (status)
            where.status = String(status);
        if (marketTarget)
            where.marketTarget = String(marketTarget);
        if (search) {
            const q = String(search).trim();
            where.OR = [
                { modelName: { contains: q, mode: 'insensitive' } },
                { chassisNumber: { contains: q, mode: 'insensitive' } },
                { engineNumber: { contains: q, mode: 'insensitive' } },
                { batchNumber: { contains: q, mode: 'insensitive' } },
                { usedDetail: { registrationNumber: { contains: q, mode: 'insensitive' } } },
                { usedDetail: { prevOwnerName: { contains: q, mode: 'insensitive' } } }
            ];
        }
        const totalCount = await prisma_js_1.prisma.bike.count({ where });
        const queryOptions = {
            where,
            orderBy: { createdAt: 'desc' },
            include: {
                model: true,
                usedDetail: true,
                sales: {
                    where: { isDeleted: false },
                    select: {
                        id: true,
                        invoiceNumber: true,
                        customerName: true,
                        saleDate: true
                    },
                    take: 1
                }
            }
        };
        if (page) {
            const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
            const limitNum = Math.max(1, parseInt(String(limit), 10) || 20);
            queryOptions.skip = (pageNum - 1) * limitNum;
            queryOptions.take = limitNum;
            const bikes = await prisma_js_1.prisma.bike.findMany(queryOptions);
            const formattedBikes = bikes.map(formatBikeResponse);
            const totalPages = Math.ceil(totalCount / limitNum);
            res.json({
                data: formattedBikes,
                bikes: formattedBikes,
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
        const bikes = await prisma_js_1.prisma.bike.findMany(queryOptions);
        const formattedBikes = bikes.map(formatBikeResponse);
        res.setHeader('X-Total-Count', totalCount.toString());
        res.json(formattedBikes);
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
        const cleanChassis = chassis.trim();
        let bike = await prisma_js_1.prisma.bike.findFirst({
            where: {
                chassisNumber: {
                    equals: cleanChassis,
                    mode: 'insensitive'
                },
                status: 'IN_STOCK',
                isDeleted: false
            },
            include: {
                model: true,
                usedDetail: true
            }
        });
        if (!bike) {
            bike = await prisma_js_1.prisma.bike.findFirst({
                where: {
                    chassisNumber: {
                        contains: cleanChassis,
                        mode: 'insensitive'
                    },
                    status: 'IN_STOCK',
                    isDeleted: false
                },
                include: {
                    model: true,
                    usedDetail: true
                }
            });
        }
        if (!bike) {
            res.status(404).json({ error: 'No available in-stock motorcycle found with this chassis number' });
            return;
        }
        res.json(formatBikeResponse(bike));
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
                model: true,
                usedDetail: true,
                sales: {
                    where: { isDeleted: false },
                    include: {
                        createdBy: { select: { name: true, username: true } },
                        documents: true
                    }
                }
            }
        });
        if (!bike || bike.isDeleted) {
            res.status(404).json({ error: 'Bike not found' });
            return;
        }
        res.json(formatBikeResponse(bike));
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to fetch bike details' });
    }
});
// POST /api/bikes - Add new motorcycle to stock
router.post('/', (0, auth_js_1.requirePermission)('MANAGE_BIKES'), (0, validate_js_1.validateBody)(schemas_js_1.createBikeSchema), async (req, res) => {
    try {
        const data = req.body;
        // Check duplicate chassis or engine
        const existing = await prisma_js_1.prisma.bike.findFirst({
            where: {
                OR: [
                    { chassisNumber: data.chassisNumber },
                    { engineNumber: data.engineNumber }
                ],
                isDeleted: false
            }
        });
        if (existing) {
            res.status(409).json({ error: 'A motorcycle with this Chassis or Engine number is already in stock' });
            return;
        }
        // Resolve or create normalized BikeModel (supporting Honda, Unique, Superstar, Suzuki, Yamaha, etc.)
        let modelId = data.modelId;
        if (!modelId && data.modelName) {
            const modelNameClean = data.modelName.trim();
            let model = await prisma_js_1.prisma.bikeModel.findUnique({ where: { name: modelNameClean } });
            if (!model) {
                // Infer or use brand provided
                const brand = data.brand?.trim() || (modelNameClean.toLowerCase().includes('yamaha') ? 'Yamaha'
                    : modelNameClean.toLowerCase().includes('suzuki') ? 'Suzuki'
                        : modelNameClean.toLowerCase().includes('unique') ? 'Unique'
                            : modelNameClean.toLowerCase().includes('superstar') ? 'Superstar'
                                : modelNameClean.toLowerCase().includes('road prince') ? 'Road Prince'
                                    : modelNameClean.toLowerCase().includes('united') ? 'United'
                                        : 'Atlas Honda');
                model = await prisma_js_1.prisma.bikeModel.create({
                    data: {
                        name: modelNameClean,
                        brand,
                        defaultRetailPrice: Number(data.retailPrice) || 0
                    }
                });
            }
            modelId = model.id;
        }
        const result = await prisma_js_1.prisma.$transaction(async (tx) => {
            // Create Bike
            const bike = await tx.bike.create({
                data: {
                    type: data.type,
                    modelId: modelId || null,
                    modelName: data.modelName.trim(),
                    engineNumber: data.engineNumber.trim(),
                    chassisNumber: data.chassisNumber.trim(),
                    color: data.color.trim(),
                    modelYear: Number(data.modelYear),
                    batchNumber: data.batchNumber?.trim() || null,
                    dealerInvoicePrice: Number(data.dealerInvoicePrice) || 0,
                    retailPrice: Number(data.retailPrice) || 0,
                    status: data.status || 'IN_STOCK',
                    marketTarget: data.marketTarget || 'BOTH',
                    notes: data.notes?.trim() || null,
                    isDeleted: false
                }
            });
            // If USED, create normalized 1-to-1 UsedBikeDetail (3NF/BCNF)
            if (data.type === 'USED') {
                await tx.usedBikeDetail.create({
                    data: {
                        bikeId: bike.id,
                        registrationNumber: data.registrationNumber?.trim() || null,
                        prevOwnerName: data.prevOwnerName?.trim() || null,
                        prevOwnerPhone: data.prevOwnerPhone?.trim() || null,
                        prevOwnerCnic: data.prevOwnerCnic?.trim() || null,
                        conditionGrade: data.conditionGrade || null,
                        purchaseCost: Number(data.purchaseCost) || 0,
                        refurbishmentCost: Number(data.refurbishmentCost) || 0,
                        expectedSellingPrice: Number(data.expectedSellingPrice) || 0
                    }
                });
            }
            return bike;
        });
        const fullBike = await prisma_js_1.prisma.bike.findUnique({
            where: { id: result.id },
            include: { model: true, usedDetail: true }
        });
        await (0, auth_js_1.logAuditEvent)(req.user?.userId, 'CREATE_BIKE', 'INVENTORY', `Registered new bike ${fullBike?.modelName} (Chassis: ${fullBike?.chassisNumber})`, req.ip);
        res.status(201).json(formatBikeResponse(fullBike));
    }
    catch (err) {
        console.error('Error creating bike:', err);
        res.status(500).json({ error: 'Failed to add bike to inventory' });
    }
});
// PUT /api/bikes/:id - Update motorcycle details
router.put('/:id', (0, auth_js_1.requirePermission)('MANAGE_BIKES'), (0, validate_js_1.validateBody)(schemas_js_1.updateBikeSchema), async (req, res) => {
    try {
        const { id } = req.params;
        const body = req.body;
        const existing = await prisma_js_1.prisma.bike.findUnique({
            where: { id },
            include: { usedDetail: true }
        });
        if (!existing || existing.isDeleted) {
            res.status(404).json({ error: 'Bike not found' });
            return;
        }
        await prisma_js_1.prisma.$transaction(async (tx) => {
            // Update core Bike fields
            await tx.bike.update({
                where: { id },
                data: {
                    ...(body.type ? { type: body.type } : {}),
                    ...(body.modelName ? { modelName: body.modelName.trim() } : {}),
                    ...(body.engineNumber ? { engineNumber: body.engineNumber.trim() } : {}),
                    ...(body.chassisNumber ? { chassisNumber: body.chassisNumber.trim() } : {}),
                    ...(body.color ? { color: body.color.trim() } : {}),
                    ...(body.modelYear ? { modelYear: Number(body.modelYear) } : {}),
                    ...(body.batchNumber !== undefined ? { batchNumber: body.batchNumber?.trim() || null } : {}),
                    ...(body.dealerInvoicePrice !== undefined ? { dealerInvoicePrice: Number(body.dealerInvoicePrice) } : {}),
                    ...(body.retailPrice !== undefined ? { retailPrice: Number(body.retailPrice) } : {}),
                    ...(body.status ? { status: body.status } : {}),
                    ...(body.marketTarget ? { marketTarget: body.marketTarget } : {}),
                    ...(body.notes !== undefined ? { notes: body.notes?.trim() || null } : {})
                }
            });
            // Update or create UsedBikeDetail if used bike fields are provided
            const hasUsedFields = body.registrationNumber !== undefined ||
                body.conditionGrade !== undefined ||
                body.purchaseCost !== undefined ||
                body.refurbishmentCost !== undefined ||
                body.expectedSellingPrice !== undefined ||
                body.prevOwnerName !== undefined ||
                body.prevOwnerPhone !== undefined ||
                body.prevOwnerCnic !== undefined;
            if (hasUsedFields || body.type === 'USED') {
                const usedData = {
                    ...(body.registrationNumber !== undefined ? { registrationNumber: body.registrationNumber?.trim() || null } : {}),
                    ...(body.conditionGrade !== undefined ? { conditionGrade: body.conditionGrade || null } : {}),
                    ...(body.purchaseCost !== undefined ? { purchaseCost: Number(body.purchaseCost) || 0 } : {}),
                    ...(body.refurbishmentCost !== undefined ? { refurbishmentCost: Number(body.refurbishmentCost) || 0 } : {}),
                    ...(body.expectedSellingPrice !== undefined ? { expectedSellingPrice: Number(body.expectedSellingPrice) || 0 } : {}),
                    ...(body.prevOwnerName !== undefined ? { prevOwnerName: body.prevOwnerName?.trim() || null } : {}),
                    ...(body.prevOwnerPhone !== undefined ? { prevOwnerPhone: body.prevOwnerPhone?.trim() || null } : {}),
                    ...(body.prevOwnerCnic !== undefined ? { prevOwnerCnic: body.prevOwnerCnic?.trim() || null } : {})
                };
                if (existing.usedDetail) {
                    await tx.usedBikeDetail.update({
                        where: { bikeId: id },
                        data: usedData
                    });
                }
                else {
                    await tx.usedBikeDetail.create({
                        data: {
                            bikeId: id,
                            ...usedData
                        }
                    });
                }
            }
        });
        const updated = await prisma_js_1.prisma.bike.findUnique({
            where: { id },
            include: { model: true, usedDetail: true }
        });
        await (0, auth_js_1.logAuditEvent)(req.user?.userId, 'UPDATE_BIKE', 'INVENTORY', `Updated bike ${updated?.modelName} (Chassis: ${updated?.chassisNumber})`, req.ip);
        res.json(formatBikeResponse(updated));
    }
    catch (err) {
        console.error('Error updating bike:', err);
        res.status(500).json({ error: 'Failed to update bike record' });
    }
});
// DELETE /api/bikes/:id - Soft Delete only
router.delete('/:id', (0, auth_js_1.requirePermission)('MANAGE_BIKES'), async (req, res) => {
    try {
        const { id } = req.params;
        const bike = await prisma_js_1.prisma.bike.findUnique({
            where: { id },
            include: {
                sales: { where: { isDeleted: false } }
            }
        });
        if (!bike || bike.isDeleted) {
            res.status(404).json({ error: 'Bike not found' });
            return;
        }
        if (bike.sales && bike.sales.length > 0) {
            res.status(400).json({ error: 'Cannot delete bike with active sales records. Cancel or refund the sale first.' });
            return;
        }
        // SOFT DELETE
        await prisma_js_1.prisma.bike.update({
            where: { id },
            data: {
                isDeleted: true,
                deletedAt: new Date()
            }
        });
        await (0, auth_js_1.logAuditEvent)(req.user?.userId, 'DELETE_BIKE', 'INVENTORY', `Soft deleted bike ${bike.modelName} (Chassis: ${bike.chassisNumber})`, req.ip);
        res.json({ message: 'Bike soft deleted successfully', id });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to delete bike' });
    }
});
// POST /api/bikes/:id/restore - Restore soft-deleted bike
router.post('/:id/restore', (0, auth_js_1.requirePermission)('MANAGE_BIKES'), async (req, res) => {
    try {
        const { id } = req.params;
        const bike = await prisma_js_1.prisma.bike.findUnique({ where: { id } });
        if (!bike) {
            res.status(404).json({ error: 'Bike not found' });
            return;
        }
        const restored = await prisma_js_1.prisma.bike.update({
            where: { id },
            data: {
                isDeleted: false,
                deletedAt: null
            },
            include: { model: true, usedDetail: true }
        });
        await (0, auth_js_1.logAuditEvent)(req.user?.userId, 'RESTORE_BIKE', 'INVENTORY', `Restored soft-deleted bike ${restored.modelName} (Chassis: ${restored.chassisNumber})`, req.ip);
        res.json(formatBikeResponse(restored));
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to restore bike' });
    }
});
exports.default = router;
