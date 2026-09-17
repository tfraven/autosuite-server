import { Router, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, requireRole, AuthenticatedRequest, logAuditEvent } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { updateSettingsSchema } from '../validation/schemas.js';

const router = Router();
router.use(authenticateToken);

const DEFAULT_SETTINGS: Record<string, string> = {
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
router.get('/', async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const settingsRecords = await prisma.platformSetting.findMany();
    const settingsMap = { ...DEFAULT_SETTINGS };

    for (const record of settingsRecords) {
      settingsMap[record.key] = record.value;
    }

    res.json(settingsMap);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve platform settings' });
  }
});

// PUT /api/settings - Update dealership platform configuration (Admin only)
router.put('/', requireRole(['Admin']), validateBody(updateSettingsSchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const updates = req.body as Record<string, any>;
    const updatedKeys: string[] = [];

    await prisma.$transaction(async (tx) => {
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

    await logAuditEvent(
      req.user?.userId,
      'UPDATE_PLATFORM_SETTINGS',
      'SETTINGS',
      `Updated platform configuration keys: ${updatedKeys.join(', ')}`,
      req.ip
    );

    // Return updated settings
    const settingsRecords = await prisma.platformSetting.findMany();
    const settingsMap = { ...DEFAULT_SETTINGS };
    for (const record of settingsRecords) {
      settingsMap[record.key] = record.value;
    }

    res.json({ message: 'Settings updated successfully', settings: settingsMap });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update platform settings' });
  }
});

export default router;
