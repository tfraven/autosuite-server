import { Router, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, requirePermission, AuthenticatedRequest, logAuditEvent } from '../middleware/auth.js';

const router = Router();
router.use(authenticateToken);

// GET /api/documents - List all vehicle paperwork records with optional pagination
router.get('/', requirePermission('MANAGE_DOCS'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { status, docType, search, page, limit = '20' } = req.query;

    const where: any = {
      sale: { isDeleted: false }
    };

    if (status) where.paperworkStatus = String(status);
    if (docType) where.docType = String(docType);

    if (search) {
      const q = String(search).trim();
      where.sale = {
        isDeleted: false,
        OR: [
          { invoiceNumber: { contains: q, mode: 'insensitive' } },
          { customerName: { contains: q, mode: 'insensitive' } },
          { customerCnic: { contains: q, mode: 'insensitive' } },
          { bike: { chassisNumber: { contains: q, mode: 'insensitive' } } },
          { bike: { engineNumber: { contains: q, mode: 'insensitive' } } }
        ]
      };
    }

    const [totalCount, pendingCount, processingCount, readyCount, deliveredCount] = await Promise.all([
      prisma.motorcycleDocument.count({ where }),
      prisma.motorcycleDocument.count({ where: { sale: { isDeleted: false }, paperworkStatus: 'PENDING_MANUFACTURER' } }),
      prisma.motorcycleDocument.count({ where: { sale: { isDeleted: false }, paperworkStatus: 'PROCESSING_EXCISE' } }),
      prisma.motorcycleDocument.count({ where: { sale: { isDeleted: false }, paperworkStatus: 'READY_FOR_PICKUP' } }),
      prisma.motorcycleDocument.count({ where: { sale: { isDeleted: false }, paperworkStatus: 'DELIVERED' } })
    ]);

    const stageCounts = {
      PENDING_MANUFACTURER: pendingCount,
      PROCESSING_EXCISE: processingCount,
      READY_FOR_PICKUP: readyCount,
      DELIVERED: deliveredCount
    };

    const queryOptions: any = {
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        sale: {
          include: {
            bike: true
          }
        }
      }
    };

    if (page) {
      const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
      const limitNum = Math.max(1, parseInt(String(limit), 10) || 20);
      queryOptions.skip = (pageNum - 1) * limitNum;
      queryOptions.take = limitNum;

      const docs = await prisma.motorcycleDocument.findMany(queryOptions);
      const totalPages = Math.ceil(totalCount / limitNum);

      res.json({
        data: docs,
        documents: docs,
        stageCounts,
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

    const docs = await prisma.motorcycleDocument.findMany(queryOptions);
    res.setHeader('X-Total-Count', totalCount.toString());
    res.json({
      data: docs,
      documents: docs,
      stageCounts,
      pagination: {
        total: totalCount,
        page: 1,
        limit: totalCount,
        totalPages: 1,
        hasNext: false,
        hasPrev: false
      }
    });
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

    if (!doc || doc.sale?.isDeleted) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    res.json(doc);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to load document' });
  }
});

// PUT /api/documents/:id/status - Update paperwork status
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
      'DOCUMENTS',
      `Updated document ${updated.docType} for ${updated.sale.customerName} to ${paperworkStatus}`,
      req.ip
    );

    res.json(updated);
  } catch (err: any) {
    console.error('Error updating document status:', err);
    res.status(500).json({ error: 'Failed to update document status' });
  }
});

export default router;
