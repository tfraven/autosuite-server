import { Router, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();
router.use(authenticateToken);
router.use(requireRole(['Admin']));

// GET /api/audit-logs - View system audit logs
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { module, action, limit = 100 } = req.query;

    const where: any = {};
    if (module) where.module = String(module);
    if (action) where.action = String(action);

    const logs = await prisma.auditLog.findMany({
      where,
      take: Number(limit),
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { username: true, name: true }
        }
      }
    });

    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve audit logs' });
  }
});

export default router;
