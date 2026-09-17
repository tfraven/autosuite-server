import { Router, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, requirePermission, AuthenticatedRequest, logAuditEvent } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { createBikeSchema, updateBikeSchema } from '../validation/schemas.js';

const router = Router();
router.use(authenticateToken);

// GET /api/bikes - list bikes with filters and optional pagination
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { type, status, marketTarget, search, page, limit = '20', includeDeleted } = req.query;

    const where: any = {};
    if (includeDeleted !== 'true') {
      where.isDeleted = false;
    }
    if (type) where.type = String(type);
    if (status) where.status = String(status);
    if (marketTarget) where.marketTarget = String(marketTarget);

    if (search) {
      const q = String(search).trim();
      where.OR = [
        { modelName: { contains: q, mode: 'insensitive' } },
        { chassisNumber: { contains: q, mode: 'insensitive' } },
        { engineNumber: { contains: q, mode: 'insensitive' } },
        { registrationNumber: { contains: q, mode: 'insensitive' } },
        { batchNumber: { contains: q, mode: 'insensitive' } }
      ];
    }

    const totalCount = await prisma.bike.count({ where });

    const queryOptions: any = {
      where,
      orderBy: { createdAt: 'desc' },
      include: {
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

      const bikes = await prisma.bike.findMany(queryOptions);
      const totalPages = Math.ceil(totalCount / limitNum);

      res.json({
        data: bikes,
        bikes,
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

    const bikes = await prisma.bike.findMany(queryOptions);
    res.setHeader('X-Total-Count', totalCount.toString());
    res.json(bikes);
  } catch (err: any) {
    console.error('Error fetching bikes:', err);
    res.status(500).json({ error: 'Failed to fetch bikes' });
  }
});

// GET /api/bikes/search-chassis/:chassis - fast lookup for sales entry
router.get('/search-chassis/:chassis', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { chassis } = req.params;
    const bike = await prisma.bike.findFirst({
      where: {
        chassisNumber: {
          contains: chassis,
          mode: 'insensitive'
        },
        status: 'IN_STOCK',
        isDeleted: false
      }
    });

    if (!bike) {
      res.status(404).json({ error: 'No available in-stock motorcycle found with this chassis number' });
      return;
    }

    res.json(bike);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to lookup chassis number' });
  }
});

// GET /api/bikes/:id
router.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const bike = await prisma.bike.findUnique({
      where: { id },
      include: {
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

    res.json(bike);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch bike details' });
  }
});

// POST /api/bikes - Add new motorcycle to stock
router.post('/', requirePermission('MANAGE_BIKES'), validateBody(createBikeSchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const data = req.body;

    // Check duplicate chassis or engine
    const existing = await prisma.bike.findFirst({
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

    const bike = await prisma.bike.create({
      data: {
        type: data.type,
        modelName: data.modelName,
        engineNumber: data.engineNumber,
        chassisNumber: data.chassisNumber,
        color: data.color,
        modelYear: Number(data.modelYear),
        batchNumber: data.batchNumber || null,
        dealerInvoicePrice: Number(data.dealerInvoicePrice) || 0,
        retailPrice: Number(data.retailPrice) || 0,
        status: data.status || 'IN_STOCK',
        marketTarget: data.marketTarget || 'BOTH',
        registrationNumber: data.registrationNumber || null,
        prevOwnerName: data.prevOwnerName || null,
        prevOwnerPhone: data.prevOwnerPhone || null,
        prevOwnerCnic: data.prevOwnerCnic || null,
        conditionGrade: data.conditionGrade || null,
        purchaseCost: Number(data.purchaseCost) || 0,
        refurbishmentCost: Number(data.refurbishmentCost) || 0,
        expectedSellingPrice: Number(data.expectedSellingPrice) || 0,
        notes: data.notes || null,
        isDeleted: false
      }
    });

    await logAuditEvent(
      req.user?.userId,
      'CREATE_BIKE',
      'INVENTORY',
      `Registered new bike ${bike.modelName} (Chassis: ${bike.chassisNumber})`,
      req.ip
    );

    res.status(201).json(bike);
  } catch (err: any) {
    console.error('Error creating bike:', err);
    res.status(500).json({ error: 'Failed to add bike to inventory' });
  }
});

// PUT /api/bikes/:id - Update motorcycle details
router.put('/:id', requirePermission('MANAGE_BIKES'), validateBody(updateBikeSchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const body = req.body;

    const existing = await prisma.bike.findUnique({ where: { id } });
    if (!existing || existing.isDeleted) {
      res.status(404).json({ error: 'Bike not found' });
      return;
    }

    const updated = await prisma.bike.update({
      where: { id },
      data: {
        ...body,
        ...(body.modelYear ? { modelYear: Number(body.modelYear) } : {}),
        ...(body.dealerInvoicePrice !== undefined ? { dealerInvoicePrice: Number(body.dealerInvoicePrice) } : {}),
        ...(body.retailPrice !== undefined ? { retailPrice: Number(body.retailPrice) } : {})
      }
    });

    await logAuditEvent(
      req.user?.userId,
      'UPDATE_BIKE',
      'INVENTORY',
      `Updated bike ${updated.modelName} (Chassis: ${updated.chassisNumber})`,
      req.ip
    );

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update bike record' });
  }
});

// DELETE /api/bikes/:id - Soft Delete only
router.delete('/:id', requirePermission('MANAGE_BIKES'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const bike = await prisma.bike.findUnique({
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
    await prisma.bike.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date()
      }
    });

    await logAuditEvent(
      req.user?.userId,
      'SOFT_DELETE_BIKE',
      'INVENTORY',
      `Soft deleted bike ${bike.modelName} (Chassis: ${bike.chassisNumber})`,
      req.ip
    );

    res.json({ message: 'Bike soft deleted successfully', id });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete bike' });
  }
});

// POST /api/bikes/:id/restore - Restore soft-deleted bike
router.post('/:id/restore', requirePermission('MANAGE_BIKES'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const bike = await prisma.bike.findUnique({ where: { id } });

    if (!bike) {
      res.status(404).json({ error: 'Bike not found' });
      return;
    }

    await prisma.bike.update({
      where: { id },
      data: {
        isDeleted: false,
        deletedAt: null
      }
    });

    await logAuditEvent(
      req.user?.userId,
      'RESTORE_BIKE',
      'INVENTORY',
      `Restored bike ${bike.modelName} (Chassis: ${bike.chassisNumber})`,
      req.ip
    );

    res.json({ message: 'Bike restored successfully', bike });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to restore bike' });
  }
});

export default router;
