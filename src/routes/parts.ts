import { Router, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, requirePermission, AuthenticatedRequest, logAuditEvent } from '../middleware/auth.js';

const router = Router();
router.use(authenticateToken);

// Helper for B2B Order Number (e.g. PO-B2B-2026-0001)
async function generateOrderNumber(): Promise<string> {
  const count = await prisma.partOrder.count();
  const year = new Date().getFullYear();
  return `B2B-${year}-${String(count + 1).padStart(4, '0')}`;
}

// Helper for Vendor PO Number (e.g. VPO-2026-0001)
async function generateVpoNumber(): Promise<string> {
  const count = await prisma.vendorPO.count();
  const year = new Date().getFullYear();
  return `VPO-${year}-${String(count + 1).padStart(4, '0')}`;
}

// GET /api/parts - List parts with search & category
router.get('/', requirePermission('MANAGE_PARTS'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { search, category, lowStockOnly } = req.query;

    const where: any = {};
    if (category) where.category = String(category);
    if (search) {
      const q = String(search).trim();
      where.OR = [
        { partCode: { contains: q } },
        { partName: { contains: q } },
        { compatibilityModel: { contains: q } }
      ];
    }

    const parts = await prisma.part.findMany({
      where,
      orderBy: { partName: 'asc' }
    });

    const results = lowStockOnly === 'true' 
      ? parts.filter((p) => p.quantity <= p.reorderThreshold)
      : parts;

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
      orderBy: { quantity: 'asc' }
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
router.post('/', requirePermission('MANAGE_PARTS'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const {
      partCode,
      partName,
      compatibilityModel,
      wholesaleCost,
      b2bSellingPrice,
      quantity,
      reorderThreshold,
      category,
      location
    } = req.body;

    if (!partCode || !partName || !compatibilityModel || wholesaleCost === undefined || b2bSellingPrice === undefined) {
      res.status(400).json({ error: 'Missing required part attributes' });
      return;
    }

    const existing = await prisma.part.findUnique({
      where: { partCode: partCode.trim() }
    });

    if (existing) {
      res.status(400).json({ error: `Part with code '${partCode}' already exists in catalog` });
      return;
    }

    const part = await prisma.part.create({
      data: {
        partCode: partCode.trim(),
        partName: partName.trim(),
        compatibilityModel: compatibilityModel.trim(),
        wholesaleCost: Number(wholesaleCost),
        b2bSellingPrice: Number(b2bSellingPrice),
        quantity: Number(quantity) || 0,
        reorderThreshold: Number(reorderThreshold) || 5,
        category: category?.trim() || 'General',
        location: location?.trim() || null
      }
    });

    await logAuditEvent(
      req.user?.userId,
      'CREATE_PART',
      'SPARE_PARTS',
      `Added spare part: ${part.partName} (${part.partCode})`,
      req.ip
    );

    res.status(201).json(part);
  } catch (err: any) {
    console.error('Error creating part:', err);
    res.status(500).json({ error: 'Failed to create spare part' });
  }
});

// PUT /api/parts/:id - Update part
router.put('/:id', requirePermission('MANAGE_PARTS'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const body = req.body;

    const existing = await prisma.part.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Part not found' });
      return;
    }

    const updated = await prisma.part.update({
      where: { id },
      data: {
        partCode: body.partCode !== undefined ? body.partCode.trim() : existing.partCode,
        partName: body.partName !== undefined ? body.partName.trim() : existing.partName,
        compatibilityModel: body.compatibilityModel !== undefined ? body.compatibilityModel.trim() : existing.compatibilityModel,
        wholesaleCost: body.wholesaleCost !== undefined ? Number(body.wholesaleCost) : existing.wholesaleCost,
        b2bSellingPrice: body.b2bSellingPrice !== undefined ? Number(body.b2bSellingPrice) : existing.b2bSellingPrice,
        quantity: body.quantity !== undefined ? Number(body.quantity) : existing.quantity,
        reorderThreshold: body.reorderThreshold !== undefined ? Number(body.reorderThreshold) : existing.reorderThreshold,
        category: body.category !== undefined ? body.category?.trim() : existing.category,
        location: body.location !== undefined ? body.location?.trim() : existing.location
      }
    });

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update part' });
  }
});

// DELETE /api/parts/:id
router.delete('/:id', requirePermission('MANAGE_PARTS'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await prisma.part.delete({ where: { id } });
    res.json({ message: 'Part deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete part' });
  }
});

// --- B2B Parts Orders ---

// GET /api/parts/orders - List B2B orders
router.get('/orders/all', requirePermission('MANAGE_PARTS'), async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const orders = await prisma.partOrder.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
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

// POST /api/parts/orders - Record B2B bulk parts order
router.post('/orders', requirePermission('MANAGE_PARTS'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { customerName, customerType, contactNumber, items, notes } = req.body;

    if (!customerName || !contactNumber || !items || !items.length) {
      res.status(400).json({ error: 'Customer name, contact, and at least one item are required' });
      return;
    }

    // Verify stock availability
    for (const item of items) {
      const part = await prisma.part.findUnique({ where: { id: item.partId } });
      if (!part) {
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
          items: {
            create: orderItemsData
          }
        },
        include: {
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

// --- Vendor Purchase Orders (PO) ---

// GET /api/parts/vendor-pos - List POs
router.get('/vendor-pos/all', requirePermission('MANAGE_PARTS'), async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const pos = await prisma.vendorPO.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
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

// POST /api/parts/vendor-pos - Create Vendor PO
router.post('/vendor-pos', requirePermission('MANAGE_PARTS'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { vendorName, contactNumber, items, notes } = req.body;
    if (!vendorName || !items || !items.length) {
      res.status(400).json({ error: 'Vendor name and item list are required' });
      return;
    }

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

    const po = await prisma.vendorPO.create({
      data: {
        poNumber,
        vendorName: vendorName.trim(),
        contactNumber: contactNumber?.trim() || null,
        status: 'ORDERED',
        orderedAt: new Date(),
        totalAmount,
        notes: notes?.trim() || null,
        items: {
          create: poItemsData
        }
      },
      include: {
        items: { include: { part: true } }
      }
    });

    await logAuditEvent(
      req.user?.userId,
      'CREATE_VENDOR_PO',
      'SPARE_PARTS',
      `Created Vendor Purchase Order ${po.poNumber} with ${vendorName}`,
      req.ip
    );

    res.status(201).json(po);
  } catch (err: any) {
    console.error('Error creating vendor PO:', err);
    res.status(500).json({ error: 'Failed to create vendor PO' });
  }
});

// PUT /api/parts/vendor-pos/:id/receive - Mark PO received and increment stock
router.put('/vendor-pos/:id/receive', requirePermission('MANAGE_PARTS'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const po = await prisma.vendorPO.findUnique({
      where: { id },
      include: { items: true }
    });

    if (!po) {
      res.status(404).json({ error: 'Purchase order not found' });
      return;
    }

    if (po.status === 'RECEIVED') {
      res.status(400).json({ error: 'Purchase order has already been received' });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
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

    await logAuditEvent(
      req.user?.userId,
      'RECEIVE_VENDOR_PO',
      'SPARE_PARTS',
      `Received shipment for PO ${po.poNumber}, parts stock updated`,
      req.ip
    );

    res.json(updated);
  } catch (err: any) {
    console.error('Error receiving PO:', err);
    res.status(500).json({ error: 'Failed to process PO receipt' });
  }
});

export default router;
