import express from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { getUserIdFromBearerToken } from '../lib/verifySupabaseToken';

const router = express.Router();

// GET /api/booking-values/:bookingDateId - Get value from booked_properties for this booking date.
// Caller must be the contractor who owns the booking request (JWT user_id matches booking_request.user_id).
router.get('/:bookingDateId', async (req, res) => {
  try {
    const bookingDateId = req.params.bookingDateId;
    if (!bookingDateId) {
      return res.status(400).json({
        success: false,
        error: 'Booking date ID is required'
      });
    }

    const userId = await getUserIdFromBearerToken(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Missing or invalid authorization header'
      });
    }

    const { data: bookingDate, error: dateError } = await supabaseAdmin
      .from('booking_dates')
      .select('booking_request_id')
      .eq('id', bookingDateId)
      .maybeSingle();

    if (dateError || !bookingDate?.booking_request_id) {
      return res.status(404).json({
        success: false,
        error: 'Booking date not found'
      });
    }

    const { data: bookingRequest, error: reqError } = await supabaseAdmin
      .from('booking_requests')
      .select('user_id, email')
      .eq('id', bookingDate.booking_request_id)
      .maybeSingle();

    if (reqError || !bookingRequest) {
      return res.status(404).json({
        success: false,
        error: 'Booking request not found'
      });
    }

    const allowedByUserId = bookingRequest.user_id === userId;
    let allowedByEmail = false;
    if (!allowedByUserId && bookingRequest.email) {
      const { data: contractor } = await supabaseAdmin
        .from('contractor')
        .select('email')
        .eq('id', userId)
        .maybeSingle();
      allowedByEmail = contractor?.email != null && contractor.email === bookingRequest.email;
    }
    if (!allowedByUserId && !allowedByEmail) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const { data: bookedProperty, error: bookedPropertyError } = await supabaseAdmin
      .from('booked_properties')
      .select('value')
      .eq('booking_id', bookingDateId)
      .maybeSingle();

    if (bookedPropertyError) {
      console.error('Error fetching booking value:', bookedPropertyError);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch booking value'
      });
    }

    if (!bookedProperty) {
      return res.status(200).json({
        success: true,
        value: null
      });
    }

    return res.status(200).json({
      success: true,
      value: bookedProperty.value ?? null
    });
  } catch (error) {
    console.error('Error fetching booking value:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch booking value'
    });
  }
});

export default router;
