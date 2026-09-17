import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';

// Determine a safe writable logs directory
let logsDir: string;
const isServerless = Boolean(
  process.env.VERCEL ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.NETLIFY ||
  process.env.SERVERLESS ||
  process.env.DISABLE_FILE_LOGS === 'true'
);

if (isServerless) {
  logsDir = path.join(os.tmpdir(), 'logs');
} else {
  logsDir = path.resolve(process.cwd(), 'logs');
}

// Try creating logs directory safely, fallback to os.tmpdir() if cwd is read-only (EROFS)
let fileLoggingDisabled = false;
try {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
} catch (err: any) {
  if (err.code === 'EROFS' || err.code === 'EACCES') {
    logsDir = path.join(os.tmpdir(), 'logs');
    try {
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
    } catch (tmpErr) {
      console.warn('[Logger] File logging disabled (read-only file system):', tmpErr);
      fileLoggingDisabled = true;
    }
  } else {
    fileLoggingDisabled = true;
  }
}

export { logsDir };

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const mainTransports: winston.transport[] = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
        const metaStr = Object.keys(meta).length > 1 ? ` ${JSON.stringify(meta)}` : '';
        return `[${timestamp}] ${level}: ${stack || message}${metaStr}`;
      })
    )
  })
];

const auditTransports: winston.transport[] = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.printf(({ timestamp, message, ...meta }) => {
        return `[AUDIT ${timestamp}] ${message} ${JSON.stringify(meta)}`;
      })
    )
  })
];

if (!fileLoggingDisabled) {
  try {
    const appRotateTransport = new DailyRotateFile({
      filename: path.join(logsDir, 'application-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '90d',
      level: 'info'
    });
    appRotateTransport.on('error', (err) => {
      console.warn('[Logger] Application log file transport error:', err.message);
    });

    const errorRotateTransport = new DailyRotateFile({
      filename: path.join(logsDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '90d',
      level: 'error'
    });
    errorRotateTransport.on('error', (err) => {
      console.warn('[Logger] Error log file transport error:', err.message);
    });

    const auditRotateTransport = new DailyRotateFile({
      filename: path.join(logsDir, 'audit-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '90d',
      level: 'info'
    });
    auditRotateTransport.on('error', (err) => {
      console.warn('[Logger] Audit log file transport error:', err.message);
    });

    mainTransports.push(appRotateTransport, errorRotateTransport);
    auditTransports.push(auditRotateTransport);
  } catch (err: any) {
    console.warn('[Logger] Daily rotate file transports skipped:', err?.message || err);
  }
}

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: logFormat,
  defaultMeta: { service: 'autosuite-erp' },
  transports: mainTransports
});

export const auditLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  defaultMeta: { service: 'autosuite-audit' },
  transports: auditTransports
});

// Express request logging middleware
export function requestLogger(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const start = Date.now();
  const { method, originalUrl, ip } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    const userId = req.user?.userId || 'anonymous';
    const username = req.user?.username || 'anonymous';

    const logData = {
      method,
      url: originalUrl,
      status: statusCode,
      durationMs: duration,
      ip: ip || req.socket.remoteAddress,
      userId,
      username,
      userAgent: req.get('user-agent')
    };

    if (statusCode >= 500) {
      logger.error(`HTTP ${method} ${originalUrl} ${statusCode} - ${duration}ms`, logData);
    } else if (statusCode >= 400) {
      logger.warn(`HTTP ${method} ${originalUrl} ${statusCode} - ${duration}ms`, logData);
    } else {
      logger.info(`HTTP ${method} ${originalUrl} ${statusCode} - ${duration}ms`, logData);
    }
  });

  next();
}
