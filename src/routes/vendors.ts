import { Router, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, requirePermission, AuthenticatedRequest, logAuditEvent } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { createVendorSchema, updateVendorSchema } from '../validation/schemas.js';

const router = Router();
router.use(authenticateToken);

// GET /api/vendors - List all vendors with PO counts and stats
router.get('/', requirePermission('MANAGE_PARTS'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { search } = req.query;
    const where: any = { isDeleted: false };

    if (search) {
      const q = String(search).trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { contactNumber: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } }
      ];
    }

    const vendors = await prisma.vendor.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        purchaseOrders: {
          where: { isDeleted: false },
          select: { id: true, totalAmount: true, status: true, orderedAt: true }
        }
      }
    });

    const results = vendors.map((v) => ({
      id: v.id,
      name: v.name,
      contactNumber: v.contactNumber,
      email: v.email,
      address: v.address,
      notes: v.notes,
      totalOrders: v.purchaseOrders.length,
      totalSpent: v.purchaseOrders.reduce((sum, po) => sum + po.totalAmount, 0),
      createdAt: v.createdAt
    }));

    res.json(results);
  } catch (err: any) {
    console.error('Error fetching vendors:', err);
    res.status(500).json({ error: 'Failed to retrieve vendors' });
  }
});

// GET /api/vendors/:id - Single vendor with purchase order history
router.get('/:id', requirePermission('MANAGE_PARTS'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const vendor = await prisma.vendor.findUnique({
      where: { id },
      include: {
        purchaseOrders: {
          where: { isDeleted: false },
          orderBy: { createdAt: 'desc' },
          include: {
            items: { include: { part: true } }
          }
        }
      }
    });

    if (!vendor || vendor.isDeleted) {
      res.status(404).json({ error: 'Vendor not found' });
      return;
    }

    res.json(vendor);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve vendor details' });
  }
});

// POST /api/vendors - Create vendor
router.post('/', requirePermission('MANAGE_PARTS'), validateBody(createVendorSchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { name, contactNumber, email, address, notes } = req.body;

    const existing = await prisma.vendor.findUnique({ where: { name: name.trim() } });
    if (existing) {
      res.status(409).json({ error: `Vendor with name '${name}' already exists` });
      return;
    }

    const vendor = await prisma.vendor.create({
      data: {
        name: name.trim(),
        contactNumber: contactNumber?.trim() || null,
        email: email?.trim().toLowerCase() || null,
        address: address?.trim() || null,
        notes: notes?.trim() || null
      }
    });

    await logAuditEvent(
      req.user?.userId,
      'CREATE_VENDOR',
      'SPARE_PARTS',
      `Registered supplier/vendor ${vendor.name}`,
      req.ip
    );

    res.status(201).json(vendor);
  } catch (err: any) {
    console.error('Error creating vendor:', err);
    res.status(500).json({ error: 'Failed to create vendor' });
  }
});

// PUT /api/vendors/:id - Update vendor
router.put('/:id', requirePermission('MANAGE_PARTS'), validateBody(updateVendorSchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const body = req.body;

    const existing = await prisma.vendor.findUnique({ where: { id } });
    if (!existing || existing.isDeleted) {
      res.status(404).json({ error: 'Vendor not found' });
      return;
    }

    const updated = await prisma.vendor.update({
      where: { id },
      data: {
        ...(body.name ? { name: body.name.trim() } : {}),
        ...(body.contactNumber !== undefined ? { contactNumber: body.contactNumber?.trim() || null } : {}),
        ...(body.email !== undefined ? { email: body.email?.trim().toLowerCase() || null } : {}),
        ...(body.address !== undefined ? { address: body.address?.trim() || null } : {}),
        ...(body.notes !== undefined ? { notes: body.notes?.trim() || null } : {})
      }
    });

    await logAuditEvent(
      req.user?.userId,
      'UPDATE_VENDOR',
      'SPARE_PARTS',
      `Updated vendor ${updated.name}`,
      req.ip
    );

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update vendor' });
  }
});

// DELETE /api/vendors/:id - Soft delete vendor
router.delete('/:id', requirePermission('MANAGE_PARTS'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const vendor = await prisma.vendor.findUnique({
      where: { id },
      include: { purchaseOrders: { where: { isDeleted: false } } }
    });

    if (!vendor || vendor.isDeleted) {
      res.status(404).json({ error: 'Vendor not found' });
      return;
    }

    if (vendor.purchaseOrders.length > 0) {
      res.status(400).json({ error: 'Cannot delete vendor with associated purchase orders' });
      return;
    }

    await prisma.vendor.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() }
    });

    await logAuditEvent(
      req.user?.userId,
      'DELETE_VENDOR',
      'SPARE_PARTS',
      `Soft deleted vendor ${vendor.name}`,
      req.ip
    );

    res.json({ message: 'Vendor soft deleted successfully', id });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete vendor' });
  }
});

export default router;
