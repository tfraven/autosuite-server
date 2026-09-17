"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_js_1 = require("../lib/prisma.js");
const auth_js_1 = require("../middleware/auth.js");
const validate_js_1 = require("../middleware/validate.js");
const schemas_js_1 = require("../validation/schemas.js");
const router = (0, express_1.Router)();
router.use(auth_js_1.authenticateToken);
const DEFAULT_SETTINGS = {
    dealershipName: 'Falcon Honda Motors',
    dealershipBranch: 'Main Campus Showroom, Lahore',
    currency: 'PKR',
    invoicePrefix: 'INV-',
    defaultTaxRate: '0',
    lowStockThreshold: '5',
    timezone: 'Asia/Karachi',
    contactPhone: '+92 42 35990000',
    ntnNumber: '4829103-8',
    logRetentionDays: '90'
};
// GET /api/settings - Retrieve dealership platform configuration
router.get('/', async (_req, res) => {
    try {
        const settingsRecords = await prisma_js_1.prisma.platformSetting.findMany();
        const settingsMap = { ...DEFAULT_SETTINGS };
        for (const record of settingsRecords) {
            settingsMap[record.key] = record.value;
        }
        res.json(settingsMap);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to retrieve platform settings' });
    }
});
// PUT /api/settings - Update dealership platform configuration (Admin only)
router.put('/', (0, auth_js_1.requireRole)(['Admin']), (0, validate_js_1.validateBody)(schemas_js_1.updateSettingsSchema), async (req, res) => {
    try {
        const updates = req.body;
        const updatedKeys = [];
        await prisma_js_1.prisma.$transaction(async (tx) => {
            for (const [key, value] of Object.entries(updates)) {
                if (value !== undefined && value !== null) {
                    const stringVal = String(value);
                    await tx.platformSetting.upsert({
                        where: { key },
                        update: { value: stringVal },
                        create: { key, value: stringVal }
                    });
                    updatedKeys.push(key);
                }
            }
        });
        await (0, auth_js_1.logAuditEvent)(req.user?.userId, 'UPDATE_PLATFORM_SETTINGS', 'SETTINGS', `Updated platform configuration keys: ${updatedKeys.join(', ')}`, req.ip);
        // Return updated settings
        const settingsRecords = await prisma_js_1.prisma.platformSetting.findMany();
        const settingsMap = { ...DEFAULT_SETTINGS };
        for (const record of settingsRecords) {
            settingsMap[record.key] = record.value;
        }
        res.json({ message: 'Settings updated successfully', settings: settingsMap });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to update platform settings' });
    }
});
exports.default = router;
