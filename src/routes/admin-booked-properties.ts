import express from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { authenticateUser, AuthenticatedRequest } from '../middleware/auth';

const router = express.Router();

// GET /api/admin-booked-properties - Get paginated booked properties with related data (requires auth)
// Query params: page (default 1), limit (default 20, max 100)
router.get('/', authenticateUser, async (req: AuthenticatedRequest, res) => {
  try {
    console.log('Fetching booked properties via backend...');

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 20), 100);
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabaseAdmin
      .from('booked_properties')
      .select(`
        *,
        properties:property_id (
          id,
          property_name,
          house_address,
          locality,
          city,
          county,
          country,
          postcode,
          property_type,
          bedrooms,
          beds,
          bathrooms
        ),
        contractor:contractor_id (
          id,
          full_name,
          email,
          phone
        ),
        booking_requests:booking_request_id (
          id,
          full_name,
          company_name,
          email,
          phone,
          city
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error fetching booked properties:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch booked properties',
        details: error.message,
        bookedProperties: []
      });
    }

    const total = count ?? 0;
    console.log(`Successfully fetched ${data?.length || 0} booked properties (page ${page} of ${Math.ceil(total / limit)})`);

    return res.status(200).json({
      success: true,
      bookedProperties: data || [],
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching booked properties:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch booked properties',
      details: error instanceof Error ? error.message : String(error),
      bookedProperties: []
    });
  }
});

export default router;

