import express from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { authenticateUser, AuthenticatedRequest } from '../middleware/auth';

const router = express.Router();

// GET /api/admin-booked-properties - Get all booked properties with related data (requires auth)
router.get('/', authenticateUser, async (req: AuthenticatedRequest, res) => {
  try {
    console.log('Fetching booked properties via backend...');

    const { data, error } = await supabaseAdmin
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
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching booked properties:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch booked properties',
        details: error.message,
        bookedProperties: []
      });
    }

    console.log(`Successfully fetched ${data?.length || 0} booked properties`);

    return res.status(200).json({
      success: true,
      bookedProperties: data || []
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

