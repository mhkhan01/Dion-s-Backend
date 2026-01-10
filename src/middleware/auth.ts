import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabase';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: 'contractor' | 'landlord' | 'admin';
    full_name: string;
  };
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

    // Verify the JWT token with Supabase
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // First, try to get user profile from 'profiles' table
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (profile) {
      req.user = {
        id: user.id,
        role: profile.role,
        full_name: profile.full_name,
      };
      return next();
    }

    // If not found in profiles, check the 'admin' table
    const { data: adminProfile, error: adminError } = await supabaseAdmin
      .from('admin')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (adminProfile) {
      req.user = {
        id: user.id,
        role: 'admin' as 'contractor' | 'landlord' | 'admin',
        full_name: adminProfile.full_name,
      };
      return next();
    }

    // If not found in either table, return 401
    return res.status(401).json({ error: 'User profile not found' });
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
