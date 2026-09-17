import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export function validateBody(schema: ZodSchema) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of err.issues) {
          const path = issue.path.join('.') || 'general';
          fieldErrors[path] = issue.message;
        }
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          message: err.issues[0]?.message || 'Invalid input data',
          details: fieldErrors
        });
        return;
      }
      next(err);
    }
  };
}

export function validateQuery(schema: ZodSchema) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      req.query = (await schema.parseAsync(req.query)) as any;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of err.issues) {
          const path = issue.path.join('.') || 'general';
          fieldErrors[path] = issue.message;
        }
        res.status(400).json({
          success: false,
          error: 'Query parameter validation failed',
          details: fieldErrors
        });
        return;
      }
      next(err);
    }
  };
}
