import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'autosuite-super-secret-jwt-key-2026';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'autosuite-refresh-secret-jwt-key-2026';

export interface TokenPayload {
  userId: string;
  username: string;
  roleId: string;
  roleName: string;
  permissions: string[];
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
}

export function generateRefreshToken(payload: { userId: string }): string {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: '7d' });
}

export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch (err) {
    return null;
  }
}

export function verifyRefreshToken(token: string): { userId: string } | null {
  try {
    return jwt.verify(token, REFRESH_SECRET) as { userId: string };
  } catch (err) {
    return null;
  }
}
