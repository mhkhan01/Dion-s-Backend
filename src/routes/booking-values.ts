import express from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { authenticateUser, AuthenticatedRequest } from '../middleware/auth';

const router = express.Router();

// GET /api/booking-values/:bookingDateId - Get booking value for a specific booking date (requires auth)
router.get('/:bookingDateId', authenticateUser, async (req: AuthenticatedRequest, res) => {
  console.log('=== Fetch Booking Value API Called (Backend) ===');
  
  try {
    const { bookingDateId } = req.params;
    
    if (!bookingDateId) {
      return res.status(400).json({
        success: false,
        error: 'Booking date ID is required'
      });
    }

    console.log('Fetching booking value for booking_id:', bookingDateId);

    // Fetch value from booked_properties table using service role (bypasses RLS)
    // Use maybeSingle() instead of single() to handle cases where no record exists
    const { data: bookedProperty, error: bookedPropertyError } = await supabaseAdmin
      .from('booked_properties')
      .select('value')
      .eq('booking_id', bookingDateId)
      .maybeSingle();

    if (bookedPropertyError) {
      console.error('Error fetching booking value:', bookedPropertyError);
      console.error('Error details:', {
        message: bookedPropertyError.message,
        details: bookedPropertyError.details,
        hint: bookedPropertyError.hint,
        code: bookedPropertyError.code
      });
      
      return res.status(500).json({
        success: false,
        error: `Failed to fetch booking value: ${bookedPropertyError.message}`,
        details: bookedPropertyError.details
      });
    }

    // If no record found, return null
    if (!bookedProperty) {
      console.log('No booked_property record found for booking_id:', bookingDateId);
      return res.status(200).json({
        success: true,
        value: null
      });
    }

    console.log('Booking value fetched successfully:', bookedProperty.value);

    // Return the value
    return res.status(200).json({
      success: true,
      value: bookedProperty.value || null
    });

  } catch (error) {
    console.error('=== Error fetching booking value ===');
    console.error('Error details:', error);
    
    return res.status(500).json({
      success: false,
      error: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

export default router;

