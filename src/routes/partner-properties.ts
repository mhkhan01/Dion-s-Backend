import express from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { getUserIdFromBearerToken } from '../lib/verifySupabaseToken';

const router = express.Router();

// GET /api/partner-properties - Get paginated properties for the authenticated landlord.
// Query params: page (default 1), limit (default 20, max 100)
// Authorization: valid Bearer JWT required; user must exist in landlord table and be active.
router.get('/', async (req, res) => {
  try {
    const landlordId = await getUserIdFromBearerToken(req);
    if (!landlordId) {
      return res.status(401).json({
        success: false,
        error: 'Missing or invalid authorization header',
        properties: []
      });
    }

    const { data: landlord, error: landlordError } = await supabaseAdmin
      .from('landlord')
      .select('id, is_active')
      .eq('id', landlordId)
      .maybeSingle();

    if (landlordError || !landlord) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        properties: []
      });
    }

    if (landlord.is_active === false) {
      return res.status(403).json({
        success: false,
        error: 'Account is inactive',
        properties: []
      });
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 20), 100);
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabaseAdmin
      .from('properties')
      .select('*', { count: 'exact' })
      .eq('landlord_id', landlordId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error fetching partner properties:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch properties',
        properties: []
      });
    }

    const total = count ?? 0;

    return res.status(200)
      .set('Cache-Control', 'no-store, no-cache, must-revalidate')
      .set('Pragma', 'no-cache')
      .json({
        success: true,
        properties: data || [],
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
  } catch (error) {
    console.error('Error fetching partner properties:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch properties',
      properties: []
    });
  }
});

export default router;
