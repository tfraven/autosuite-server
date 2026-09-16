import { Router, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, requirePermission, AuthenticatedRequest, logAuditEvent } from '../middleware/auth.js';

const router = Router();
router.use(authenticateToken);

// GET /api/documents - List all vehicle paperwork records
router.get('/', requirePermission('MANAGE_DOCS'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { status, docType, search } = req.query;

    const where: any = {};
    if (status) where.paperworkStatus = String(status);
    if (docType) where.docType = String(docType);

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

    const docs = await prisma.motorcycleDocument.findMany({
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
  } catch (err: any) {
    console.error('Error fetching documents:', err);
    res.status(500).json({ error: 'Failed to retrieve documents' });
  }
});

// GET /api/documents/:id - Get single document with populated template data
router.get('/:id', requirePermission('MANAGE_DOCS'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const doc = await prisma.motorcycleDocument.findUnique({
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
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to load document' });
  }
});

// PUT /api/documents/:id/status - Update paperwork status (e.g. from Honda Atlas -> Excise Office -> Pickup)
router.put('/:id/status', requirePermission('MANAGE_DOCS'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { paperworkStatus, statusNotes } = req.body;

    const validStatuses = ['PENDING_MANUFACTURER', 'PROCESSING_EXCISE', 'READY_FOR_PICKUP', 'DELIVERED'];
    if (!paperworkStatus || !validStatuses.includes(paperworkStatus)) {
      res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
      return;
    }

    const updated = await prisma.motorcycleDocument.update({
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

    await logAuditEvent(
      req.user?.userId,
      'UPDATE_DOC_STATUS',
      'PAPERWORK',
      `Updated ${updated.docType} for Chassis ${updated.sale.bike.chassisNumber} to ${paperworkStatus}`,
      req.ip
    );

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update document status' });
  }
});

// POST /api/documents/generate - Generate extra documents for a sale
router.post('/generate', requirePermission('MANAGE_DOCS'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { saleId, docType } = req.body;
    if (!saleId || !docType) {
      res.status(400).json({ error: 'Sale ID and Doc Type are required' });
      return;
    }

    const doc = await prisma.motorcycleDocument.create({
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
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate document' });
  }
});

export default router;
