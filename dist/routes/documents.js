"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_js_1 = require("../lib/prisma.js");
const auth_js_1 = require("../middleware/auth.js");
const router = (0, express_1.Router)();
router.use(auth_js_1.authenticateToken);
// GET /api/documents - List all vehicle paperwork records
router.get('/', (0, auth_js_1.requirePermission)('MANAGE_DOCS'), async (req, res) => {
    try {
        const { status, docType, search } = req.query;
        const where = {};
        if (status)
            where.paperworkStatus = String(status);
        if (docType)
            where.docType = String(docType);
        if (search) {
            const q = String(search).trim();
            where.sale = {
                OR: [
                    { invoiceNumber: { contains: q } },
                    { customerName: { contains: q } },
                    { customerCnic: { contains: q } },
                    { bike: { chassisNumber: { contains: q } } },
                    { bike: { engineNumber: { contains: q } } }
                ]
            };
        }
        const docs = await prisma_js_1.prisma.motorcycleDocument.findMany({
            where,
            orderBy: { updatedAt: 'desc' },
            include: {
                sale: {
                    include: {
                        bike: true
                    }
                }
            }
        });
        res.json(docs);
    }
    catch (err) {
        console.error('Error fetching documents:', err);
        res.status(500).json({ error: 'Failed to retrieve documents' });
    }
});
// GET /api/documents/:id - Get single document with populated template data
router.get('/:id', (0, auth_js_1.requirePermission)('MANAGE_DOCS'), async (req, res) => {
    try {
        const { id } = req.params;
        const doc = await prisma_js_1.prisma.motorcycleDocument.findUnique({
            where: { id },
            include: {
                sale: {
                    include: {
                        bike: true,
                        createdBy: { select: { name: true } }
                    }
                }
            }
        });
        if (!doc) {
            res.status(404).json({ error: 'Document not found' });
            return;
        }
        res.json(doc);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to load document' });
    }
});
// PUT /api/documents/:id/status - Update paperwork status (e.g. from Honda Atlas -> Excise Office -> Pickup)
router.put('/:id/status', (0, auth_js_1.requirePermission)('MANAGE_DOCS'), async (req, res) => {
    try {
        const { id } = req.params;
        const { paperworkStatus, statusNotes } = req.body;
        const validStatuses = ['PENDING_MANUFACTURER', 'PROCESSING_EXCISE', 'READY_FOR_PICKUP', 'DELIVERED'];
        if (!paperworkStatus || !validStatuses.includes(paperworkStatus)) {
            res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
            return;
        }
        const updated = await prisma_js_1.prisma.motorcycleDocument.update({
            where: { id },
            data: {
                paperworkStatus,
                statusNotes: statusNotes !== undefined ? statusNotes : undefined,
                updatedAt: new Date()
            },
            include: {
                sale: {
                    include: { bike: true }
                }
            }
        });
        await (0, auth_js_1.logAuditEvent)(req.user?.userId, 'UPDATE_DOC_STATUS', 'PAPERWORK', `Updated ${updated.docType} for Chassis ${updated.sale.bike.chassisNumber} to ${paperworkStatus}`, req.ip);
        res.json(updated);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to update document status' });
    }
});
// POST /api/documents/generate - Generate extra documents for a sale
router.post('/generate', (0, auth_js_1.requirePermission)('MANAGE_DOCS'), async (req, res) => {
    try {
        const { saleId, docType } = req.body;
        if (!saleId || !docType) {
            res.status(400).json({ error: 'Sale ID and Doc Type are required' });
            return;
        }
        const doc = await prisma_js_1.prisma.motorcycleDocument.create({
            data: {
                saleId,
                docType,
                paperworkStatus: 'PENDING_MANUFACTURER',
                statusNotes: 'Document manually created.'
            },
            include: {
                sale: {
                    include: { bike: true }
                }
            }
        });
        res.status(201).json(doc);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to generate document' });
    }
});
exports.default = router;
