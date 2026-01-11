import express from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { authenticateUser, AuthenticatedRequest } from '../middleware/auth';

const router = express.Router();

// GET /api/admin-bookings - Get all booking requests with related data (requires auth)
router.get('/', authenticateUser, async (req: AuthenticatedRequest, res) => {
  try {
    console.log('Fetching booking requests via backend...');

    let bookingRequests = [];

    try {
      // Try booking_requests table with booking_dates, assigned properties, and contractor info
      const { data, error: bookingError } = await supabaseAdmin
        .from('booking_requests')
        .select(`
          *,
          contractor(
            id,
            full_name,
            email,
            code
          ),
          booking_dates(
            id,
            start_date,
            end_date,
            status,
            created_at,
            booked_properties(
              property_id,
              property_name,
              property_type,
              property_address
            )
          )
        `)
        .order('created_at', { ascending: false });
      
      if (!bookingError && data) {
        bookingRequests = data;
      } else {
        throw bookingError;
      }
    } catch (error) {
      console.log('booking_requests table failed, trying bookings table...', error);
      
      // Try bookings table from the original schema
      const { data, error: bookingsError } = await supabaseAdmin
        .from('bookings')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (bookingsError) {
        throw bookingsError;
      }
      bookingRequests = data || [];
    }

    // Process booking requests to create separate entries for each date range
    const expandedBookings = [];
    
    for (const booking of bookingRequests) {
      // If booking has booking_dates, create a separate entry for each date range
      if (booking.booking_dates && booking.booking_dates.length > 0) {
        for (const dateRange of booking.booking_dates) {
          // Map database status to display status
          let displayStatus = booking.status || 'pending';
          if (dateRange.status === 'confirmed') {
            displayStatus = 'active';
          } else if (dateRange.status) {
            displayStatus = dateRange.status;
          }

          // Get assigned property information from booked_properties
          let assignedProperty = null;
          if (dateRange.booked_properties && dateRange.booked_properties.length > 0) {
            const bookedProperty = dateRange.booked_properties[0];
            assignedProperty = {
              id: bookedProperty.property_id,
              property_name: bookedProperty.property_name || 'Assigned Property',
              full_address: bookedProperty.property_address || 'Address',
              property_type: bookedProperty.property_type || 'Property Type',
              weekly_rate: 0,
              monthly_rate: 0
            };
          } else if (booking.assigned_property_id) {
            // Fallback to old assigned_property_id if no booked_properties found
            assignedProperty = {
              id: booking.assigned_property_id,
              property_name: 'Property',
              full_address: 'Address',
              weekly_rate: 0,
              monthly_rate: 0
            };
          }
          
          expandedBookings.push({
            ...booking,
            id: `${booking.id}-${dateRange.id}`, // Create unique ID for each date range
            status: displayStatus, // Use the mapped status
            booking_dates: [dateRange], // Only include this specific date range
            assigned_property: assignedProperty,
            contractor: {
              id: booking.contractor?.id || booking.user_id || booking.contractor_id || 'unknown',
              full_name: booking.contractor?.full_name || booking.full_name || 'Unknown Contractor',
              email: booking.contractor?.email || booking.email || 'contractor@example.com',
              code: booking.contractor?.code || null
            }
          });
        }
      } else {
        // If no booking_dates, create a single entry
        expandedBookings.push({
          ...booking,
          booking_dates: [],
          status: booking.status || 'pending', // Use booking status as fallback
          assigned_property: booking.assigned_property_id ? {
            id: booking.assigned_property_id,
            property_name: 'Property',
            full_address: 'Address',
            weekly_rate: 0,
            monthly_rate: 0
          } : null,
          contractor: {
            id: booking.contractor?.id || booking.user_id || booking.contractor_id || 'unknown',
            full_name: booking.contractor?.full_name || booking.full_name || 'Unknown Contractor',
            email: booking.contractor?.email || booking.email || 'contractor@example.com',
            code: booking.contractor?.code || null
          }
        });
      }
    }

    console.log(`Successfully fetched ${expandedBookings.length} bookings`);

    return res.status(200).json({
      success: true,
      bookings: expandedBookings
    });
  } catch (error) {
    console.error('Error fetching booking requests:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch booking requests',
      details: error instanceof Error ? error.message : String(error),
      bookings: []
    });
  }
});

export default router;









