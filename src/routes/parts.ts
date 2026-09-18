import { Router, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, requirePermission, AuthenticatedRequest, logAuditEvent } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { createPartSchema, updatePartSchema, createPartOrderSchema, createVendorPOSchema } from '../validation/schemas.js';

const router = Router();
router.use(authenticateToken);

// Helper to generate B2B Parts Order Number (e.g. B2B-2026-0001)
async function generateOrderNumber(): Promise<string> {
  const count = await prisma.partOrder.count();
  const year = new Date().getFullYear();
  const seq = String(count + 1).padStart(4, '0');
  return `B2B-${year}-${seq}`;
}

// Helper to generate Vendor Purchase Order Number (e.g. VPO-2026-0001)
async function generateVpoNumber(): Promise<string> {
  const count = await prisma.vendorPO.count();
  const year = new Date().getFullYear();
  const seq = String(count + 1).padStart(4, '0');
  return `VPO-${year}-${seq}`;
}

// ================= PART CATEGORIES (3NF/BCNF) =================
// GET /api/parts/categories/all - List categories
router.get('/categories/all', requirePermission('MANAGE_PARTS'), async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const categories = await prisma.partCategory.findMany({
      where: { isDeleted: false },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { parts: true } }
      }
    });
    res.json(categories);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve part categories' });
  }
});

// POST /api/parts/categories - Add category
router.post('/categories', requirePermission('MANAGE_PARTS'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) {
      res.status(400).json({ error: 'Category name is required' });
      return;
    }

    const existing = await prisma.partCategory.findUnique({ where: { name: name.trim() } });
    if (existing) {
      res.status(409).json({ error: `Category '${name}' already exists` });
      return;
    }

    const cat = await prisma.partCategory.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null
      }
    });
    res.status(201).json(cat);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// ================= SPARE PARTS CATALOG =================

// GET /api/parts - List spare parts with stock levels and optional pagination
router.get('/', requirePermission('MANAGE_PARTS'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { category, search, lowStockOnly, page, limit = '20', includeDeleted } = req.query;

    const where: any = {};
    if (includeDeleted !== 'true') {
      where.isDeleted = false;
    }
    if (category) {
      where.OR = [
        { category: String(category) },
        { categoryRef: { name: String(category) } }
      ];
    }

    if (search) {
      const q = String(search).trim();
      where.OR = [
        { partCode: { contains: q, mode: 'insensitive' } },
        { partName: { contains: q, mode: 'insensitive' } },
        { compatibilityModel: { contains: q, mode: 'insensitive' } },
        { location: { contains: q, mode: 'insensitive' } }
      ];
    }

    const totalCount = await prisma.part.count({ where });

    const queryOptions: any = {
      where,
      orderBy: { partName: 'asc' },
      include: {
        categoryRef: true
      }
    };

    if (page) {
      const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
      const limitNum = Math.max(1, parseInt(String(limit), 10) || 20);
      queryOptions.skip = (pageNum - 1) * limitNum;
      queryOptions.take = limitNum;

      let parts = await prisma.part.findMany(queryOptions);
      if (lowStockOnly === 'true') {
        parts = parts.filter((p) => p.quantity <= p.reorderThreshold);
      }
      const totalPages = Math.ceil(totalCount / limitNum);

      res.json({
        data: parts,
        parts,
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

    const parts = await prisma.part.findMany(queryOptions);
    const results = lowStockOnly === 'true'
      ? parts.filter((p) => p.quantity <= p.reorderThreshold)
      : parts;

    res.setHeader('X-Total-Count', totalCount.toString());
    res.json(results);
  } catch (err: any) {
    console.error('Error fetching parts:', err);
    res.status(500).json({ error: 'Failed to fetch spare parts' });
  }
});

// GET /api/parts/alerts/low-stock - List low stock alerts
router.get('/alerts/low-stock', requirePermission('MANAGE_PARTS'), async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const allParts = await prisma.part.findMany({
      where: { isDeleted: false },
      orderBy: { quantity: 'asc' },
      include: { categoryRef: true }
    });

    const lowStockParts = allParts.filter((p) => p.quantity <= p.reorderThreshold);
    res.json({
      count: lowStockParts.length,
      parts: lowStockParts
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch low stock alerts' });
  }
});

// POST /api/parts - Add new part to catalog
router.post('/', requirePermission('MANAGE_PARTS'), validateBody(createPartSchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const data = req.body;

    const existing = await prisma.part.findFirst({
      where: { partCode: data.partCode, isDeleted: false }
    });
    if (existing) {
      res.status(409).json({ error: `Part code '${data.partCode}' is already registered` });
      return;
    }

    // Resolve category if provided
    let categoryId = data.categoryId;
    if (!categoryId && data.category) {
      const catClean = data.category.trim();
      let cat = await prisma.partCategory.findUnique({ where: { name: catClean } });
      if (!cat) {
        cat = await prisma.partCategory.create({ data: { name: catClean } });
      }
      categoryId = cat.id;
    }

    const part = await prisma.part.create({
      data: {
        partCode: data.partCode,
        partName: data.partName,
        compatibilityModel: data.compatibilityModel,
        wholesaleCost: Number(data.wholesaleCost),
        b2bSellingPrice: Number(data.b2bSellingPrice),
        quantity: Number(data.quantity) || 0,
        reorderThreshold: Number(data.reorderThreshold) || 5,
        categoryId: categoryId || null,
        category: data.category || null,
        location: data.location || null,
        isDeleted: false
      },
      include: { categoryRef: true }
    });

    await logAuditEvent(
      req.user?.userId,
      'CREATE_PART',
      'SPARE_PARTS',
      `Registered spare part ${part.partName} [${part.partCode}]`,
      req.ip
    );

    res.status(201).json(part);
  } catch (err: any) {
    console.error('Error creating part:', err);
    res.status(500).json({ error: 'Failed to add spare part' });
  }
});

// PUT /api/parts/:id - Update part
router.put('/:id', requirePermission('MANAGE_PARTS'), validateBody(updatePartSchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const body = req.body;

    const existing = await prisma.part.findUnique({ where: { id } });
    if (!existing || existing.isDeleted) {
      res.status(404).json({ error: 'Part not found' });
      return;
    }

    let categoryId = body.categoryId;
    if (body.category && !categoryId) {
      const catClean = body.category.trim();
      let cat = await prisma.partCategory.findUnique({ where: { name: catClean } });
      if (!cat) {
        cat = await prisma.partCategory.create({ data: { name: catClean } });
      }
      categoryId = cat.id;
    }

    const updated = await prisma.part.update({
      where: { id },
      data: {
        ...body,
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(body.wholesaleCost !== undefined ? { wholesaleCost: Number(body.wholesaleCost) } : {}),
        ...(body.b2bSellingPrice !== undefined ? { b2bSellingPrice: Number(body.b2bSellingPrice) } : {}),
        ...(body.quantity !== undefined ? { quantity: Number(body.quantity) } : {}),
        ...(body.reorderThreshold !== undefined ? { reorderThreshold: Number(body.reorderThreshold) } : {})
      },
      include: { categoryRef: true }
    });

    await logAuditEvent(
      req.user?.userId,
      'UPDATE_PART',
      'SPARE_PARTS',
      `Updated spare part ${updated.partName} [${updated.partCode}]`,
      req.ip
    );

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update spare part' });
  }
});

// DELETE /api/parts/:id - Soft Delete part
router.delete('/:id', requirePermission('MANAGE_PARTS'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const part = await prisma.part.findUnique({ where: { id } });

    if (!part || part.isDeleted) {
      res.status(404).json({ error: 'Part not found' });
      return;
    }

    await prisma.part.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() }
    });

    await logAuditEvent(
      req.user?.userId,
      'DELETE_PART',
      'SPARE_PARTS',
      `Soft deleted spare part ${part.partName} [${part.partCode}]`,
      req.ip
    );

    res.json({ message: 'Part soft deleted successfully', id });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete part' });
  }
});

// POST /api/parts/:id/restore - Restore soft-deleted part
router.post('/:id/restore', requirePermission('MANAGE_PARTS'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const part = await prisma.part.findUnique({ where: { id } });

    if (!part) {
      res.status(404).json({ error: 'Part not found' });
      return;
    }

    const restored = await prisma.part.update({
      where: { id },
      data: { isDeleted: false, deletedAt: null }
    });

    await logAuditEvent(
      req.user?.userId,
      'RESTORE_PART',
      'SPARE_PARTS',
      `Restored spare part ${restored.partName} [${restored.partCode}]`,
      req.ip
    );

    res.json(restored);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to restore part' });
  }
});

// ================= B2B SPARE PARTS ORDERS (3NF/BCNF) =================

// GET /api/parts/orders/all - List B2B orders
router.get('/orders/all', requirePermission('MANAGE_PARTS'), async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const orders = await prisma.partOrder.findMany({
      where: { isDeleted: false },
      orderBy: { createdAt: 'desc' },
      include: {
        customer: true,
        items: {
          include: { part: true }
        }
      }
    });
    res.json(orders);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch B2B parts orders' });
  }
});

// POST /api/parts/orders - Record B2B bulk parts order with normalized customer linkage
router.post('/orders', requirePermission('MANAGE_PARTS'), validateBody(createPartOrderSchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { customerId, customerName, customerType, contactNumber, items, notes } = req.body;

    // Verify stock availability
    for (const item of items) {
      const part = await prisma.part.findUnique({ where: { id: item.partId } });
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

    const order = await prisma.$transaction(async (tx) => {
      // 1. Resolve or Create normalized Customer record (3NF/BCNF)
      let resolvedCustomerId = customerId;
      if (!resolvedCustomerId && contactNumber) {
        const cleanPhone = contactNumber.trim();
        const existingCust = await tx.customer.findUnique({ where: { phone: cleanPhone } });
        if (existingCust) {
          resolvedCustomerId = existingCust.id;
        } else {
          const newCust = await tx.customer.create({
            data: {
              name: customerName.trim(),
              phone: cleanPhone,
              customerType: customerType || 'WORKSHOP'
            }
          });
          resolvedCustomerId = newCust.id;
        }
      }

      let totalAmount = 0;
      const orderItemsData: any[] = [];

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
          customerId: resolvedCustomerId || null,
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
          customer: true,
          items: { include: { part: true } }
        }
      });
    });

    await logAuditEvent(
      req.user?.userId,
      'CREATE_PARTS_ORDER',
      'SPARE_PARTS',
      `Issued B2B Parts Order ${order.orderNumber} for ${customerName} (Total: ${order.totalAmount})`,
      req.ip
    );

    res.status(201).json(order);
  } catch (err: any) {
    console.error('Error creating B2B parts order:', err);
    res.status(500).json({ error: 'Failed to record parts order' });
  }
});

// DELETE /api/parts/orders/:id - Soft Delete Order
router.delete('/orders/:id', requirePermission('MANAGE_PARTS'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const order = await prisma.partOrder.findUnique({ where: { id } });

    if (!order || order.isDeleted) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    await prisma.partOrder.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date(), status: 'CANCELLED' }
    });

    res.json({ message: 'Parts order soft deleted successfully', id });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete order' });
  }
});

// ================= VENDOR PURCHASE ORDERS (3NF/BCNF) =================

// GET /api/parts/vendor-pos/all - List POs
router.get('/vendor-pos/all', requirePermission('MANAGE_PARTS'), async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const pos = await prisma.vendorPO.findMany({
      where: { isDeleted: false },
      orderBy: { createdAt: 'desc' },
      include: {
        vendor: true,
        items: {
          include: { part: true }
        }
      }
    });
    res.json(pos);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch vendor purchase orders' });
  }
});

// POST /api/parts/vendor-pos - Create Vendor PO with normalized vendor linkage
router.post('/vendor-pos', requirePermission('MANAGE_PARTS'), validateBody(createVendorPOSchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { vendorId, vendorName, contactNumber, items, notes } = req.body;

    const poNumber = await generateVpoNumber();
    let totalAmount = 0;
    const poItemsData: any[] = [];

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

    const po = await prisma.$transaction(async (tx) => {
      // 1. Resolve or create normalized Vendor (3NF/BCNF)
      let resolvedVendorId = vendorId;
      if (!resolvedVendorId && vendorName) {
        const cleanName = vendorName.trim();
        const existingVendor = await tx.vendor.findUnique({ where: { name: cleanName } });
        if (existingVendor) {
          resolvedVendorId = existingVendor.id;
        } else {
          const newVendor = await tx.vendor.create({
            data: {
              name: cleanName,
              contactNumber: contactNumber?.trim() || null
            }
          });
          resolvedVendorId = newVendor.id;
        }
      }

      return tx.vendorPO.create({
        data: {
          poNumber,
          vendorId: resolvedVendorId || null,
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
          vendor: true,
          items: { include: { part: true } }
        }
      });
    });

    await logAuditEvent(
      req.user?.userId,
      'CREATE_VENDOR_PO',
      'SPARE_PARTS',
      `Issued Vendor PO ${po.poNumber} to ${vendorName} for PKR ${totalAmount}`,
      req.ip
    );

    res.status(201).json(po);
  } catch (err: any) {
    console.error('Error creating vendor PO:', err);
    res.status(500).json({ error: 'Failed to record purchase order' });
  }
});

// PUT /api/parts/vendor-pos/:id/receive - Receive goods and restock inventory
router.put('/vendor-pos/:id/receive', requirePermission('MANAGE_PARTS'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const po = await prisma.vendorPO.findUnique({
      where: { id },
      include: { items: true }
    });

    if (!po || po.isDeleted) {
      res.status(404).json({ error: 'Purchase order not found' });
      return;
    }

    if (po.status === 'RECEIVED') {
      res.status(400).json({ error: 'Purchase order has already been received and stocked' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      // 1. Restock parts
      for (const item of po.items) {
        await tx.part.update({
          where: { id: item.partId },
          data: {
            quantity: { increment: item.quantityOrdered }
          }
        });

        await tx.vendorPOItem.update({
          where: { id: item.id },
          data: { quantityReceived: item.quantityOrdered }
        });
      }

      // 2. Mark PO as received
      await tx.vendorPO.update({
        where: { id },
        data: {
          status: 'RECEIVED',
          receivedAt: new Date()
        }
      });
    });

    await logAuditEvent(
      req.user?.userId,
      'RECEIVE_VENDOR_PO',
      'SPARE_PARTS',
      `Received goods and restocked inventory from PO ${po.poNumber}`,
      req.ip
    );

    const updated = await prisma.vendorPO.findUnique({
      where: { id },
      include: {
        vendor: true,
        items: { include: { part: true } }
      }
    });

    res.json(updated);
  } catch (err: any) {
    console.error('Error receiving purchase order:', err);
    res.status(500).json({ error: 'Failed to receive goods' });
  }
});

// DELETE /api/parts/vendor-pos/:id - Soft Delete PO
router.delete('/vendor-pos/:id', requirePermission('MANAGE_PARTS'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const po = await prisma.vendorPO.findUnique({ where: { id } });

    if (!po || po.isDeleted) {
      res.status(404).json({ error: 'Purchase order not found' });
      return;
    }

    await prisma.vendorPO.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date(), status: 'CANCELLED' }
    });

    res.json({ message: 'Purchase order soft deleted successfully', id });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete purchase order' });
  }
});

export default router;
