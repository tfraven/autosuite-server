import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
}

export async function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  const payload = verifyAccessToken(token);
  if (!payload) {
    res.status(403).json({ error: 'Invalid or expired access token' });
    return;
  }

  req.user = payload;
  next();
}

export function requireRole(allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!allowedRoles.includes(req.user.roleName)) {
      res.status(403).json({ 
        error: `Forbidden: role '${req.user.roleName}' does not have access to this resource` 
      });
      return;
    }

    next();
  };
}

export function requirePermission(permissionName: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Admin role bypasses granular permission checks
    if (req.user.roleName === 'Admin') {
      next();
      return;
    }

    if (!req.user.permissions || !req.user.permissions.includes(permissionName)) {
      res.status(403).json({ 
        error: `Forbidden: missing permission '${permissionName}'` 
      });
      return;
    }

    next();
  };
}

export async function logAuditEvent(
  userId: string | undefined,
  action: string,
  module: string,
  details: string,
  ipAddress?: string
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId || null,
        action,
        module,
        details,
        ipAddress: ipAddress || '127.0.0.1'
      }
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}
