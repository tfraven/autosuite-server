import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { logger } from '../lib/logger.js';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const isProd = process.env.NODE_ENV === 'production';

  // Log error with context
  logger.error('Unhandled API Error', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip
  });

  // Handle Prisma Known Errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[])?.join(', ') || 'field';
      res.status(409).json({
        success: false,
        error: `A record with this ${target} already exists in the system.`,
        code: 'DUPLICATE_KEY',
        fields: err.meta?.target
      });
      return;
    }

    if (err.code === 'P2025') {
      res.status(404).json({
        success: false,
        error: (err.meta?.cause as string) || 'Requested record was not found.',
        code: 'RECORD_NOT_FOUND'
      });
      return;
    }

    if (err.code === 'P2003') {
      res.status(400).json({
        success: false,
        error: 'Operation failed due to a foreign key relationship constraint.',
        code: 'FOREIGN_KEY_VIOLATION'
      });
      return;
    }
  }

  // Handle Zod Validation Errors
  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of err.issues) {
      const path = issue.path.join('.') || 'general';
      fieldErrors[path] = issue.message;
    }
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: fieldErrors
    });
    return;
  }

  // Handle SyntaxError / Malformed JSON
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      success: false,
      error: 'Malformed JSON payload in request body'
    });
    return;
  }

  // Fallback 500 Internal Server Error
  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: err.message || 'Internal server error occurred',
    ...(isProd ? {} : { stack: err.stack })
  });
}
