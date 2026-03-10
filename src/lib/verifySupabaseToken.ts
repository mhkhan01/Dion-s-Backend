import { Request } from 'express';
import jwt from 'jsonwebtoken';
import { supabaseAdmin } from './supabase';

/**
 * Verifies the Bearer token and returns the user id (JWT sub) if valid.
 * Used by login-check endpoints that need to verify the caller without requiring
 * the user to exist in profiles/admin tables.
 * Returns null if header is missing, token is invalid, or expired.
 */
export async function getUserIdFromBearerToken(req: Request): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return null;
  }

  const jwtSecret = process.env.SUPABASE_JWT_SECRET;

  if (jwtSecret) {
    try {
      const decoded = jwt.verify(token, jwtSecret) as jwt.JwtPayload;
      const sub = decoded.sub;
      if (!sub || typeof sub !== 'string') {
        return null;
      }
      return sub;
    } catch {
      return null;
    }
  }

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    return null;
  }
  return user.id;
}
