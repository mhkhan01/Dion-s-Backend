import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '../lib/supabase';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: 'contractor' | 'landlord' | 'admin';
    full_name: string;
  };
}

/** Resolve req.user from userId (after JWT is verified). Shared by both verification paths. */
async function setUserFromId(req: AuthenticatedRequest, userId: string): Promise<boolean> {
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (profile) {
    req.user = {
      id: userId,
      role: profile.role,
      full_name: profile.full_name,
    };
    return true;
  }

  const { data: adminProfile, error: adminError } = await supabaseAdmin
    .from('admin')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (adminProfile) {
    req.user = {
      id: userId,
      role: 'admin' as 'contractor' | 'landlord' | 'admin',
      full_name: adminProfile.full_name,
    };
    return true;
  }

  return false;
}

export const authenticateUser = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    const jwtSecret = process.env.SUPABASE_JWT_SECRET;

    let userId: string;

    if (jwtSecret) {
      // Verify JWT locally using the Supabase legacy JWT secret (recommended for production)
      try {
        const decoded = jwt.verify(token, jwtSecret) as jwt.JwtPayload;
        const sub = decoded.sub;
        if (!sub || typeof sub !== 'string') {
          return res.status(401).json({ error: 'Invalid or expired token' });
        }
        userId = sub;
      } catch (err) {
        if (err instanceof jwt.TokenExpiredError) {
          return res.status(401).json({ error: 'Invalid or expired token' });
        }
        if (err instanceof jwt.JsonWebTokenError) {
          return res.status(401).json({ error: 'Invalid or expired token' });
        }
        throw err;
      }
    } else {
      // Fallback: verify via Supabase API when SUPABASE_JWT_SECRET is not set
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
      if (authError || !user) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
      userId = user.id;
    }

    const found = await setUserFromId(req, userId);
    if (!found) {
      return res.status(401).json({ error: 'User profile not found' });
    }
    return next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({ error: 'Internal server error during authentication' });
  }
};

export const requireRole = (allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    return next();
  };
};

export const requireAdmin = requireRole(['admin']);
export const requireLandlord = requireRole(['landlord', 'admin']);
export const requireContractor = requireRole(['contractor', 'admin']);
