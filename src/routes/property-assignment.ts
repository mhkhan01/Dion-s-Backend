import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';

const router = Router();

// POST /api/property-assignment - Assign property to booking
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      booking_date_id,
      property_id,
      start_date,
      end_date,
      postcode,
      contractor_name,
      contractor_email,
      contractor_phone,
      team_size,
      property_name,
      property_type,
      property_address,
      landlord_name,
      landlord_contact,
      value
    } = req.body;

    // Validate required fields
    if (!booking_date_id || !property_id || !start_date || !end_date) {
      return res.status(400).json({
        error: 'Missing required fields: booking_date_id, property_id, start_date, end_date'
      });
    }

    // Get contractor_id from contractor table
    let contractorId = null;
    if (contractor_name && contractor_email) {
      const { data: contractorData } = await supabase
        .from('contractor')
        .select('id')
        .eq('full_name', contractor_name)
        .eq('email', contractor_email)
        .single();
      
      if (contractorData) {
        contractorId = contractorData.id;
      }
    }

    // Get landlord_id from landlord table
    let landlordId = null;
    if (landlord_name && landlord_contact) {
      let landlordQuery = supabase
        .from('landlord')
        .select('id')
        .eq('full_name', landlord_name);

      if (landlord_contact.includes('@')) {
        landlordQuery = landlordQuery.eq('email', landlord_contact);
      } else {
        landlordQuery = landlordQuery.eq('contact_number', landlord_contact);
      }

      const { data: landlordData } = await landlordQuery.single();
      
      if (landlordData) {
        landlordId = landlordData.id;
      }
    }

    // Get booking_request_id from booking_dates
    let bookingRequestId = null;
    const { data: bookingDateData } = await supabase
      .from('booking_dates')
      .select('booking_request_id')
      .eq('id', booking_date_id)
      .single();
    
    if (bookingDateData) {
      bookingRequestId = bookingDateData.booking_request_id;
    }

    // Check if booking already exists in booked_properties
    const { data: existingBooking } = await supabase
      .from('booked_properties')
      .select('id')
      .eq('booking_id', booking_date_id)
      .maybeSingle();
    
    if (existingBooking) {
      return res.status(409).json({
        error: 'This booking is already assigned to a property',
        code: 'BOOKING_ALREADY_EXISTS'
      });
    }

    // Check for date overlaps with existing bookings
    const { data: existingBookings } = await supabase
      .from('booked_properties')
      .select('start_date, end_date')
      .eq('property_id', property_id);

    if (existingBookings && existingBookings.length > 0) {
      for (const booking of existingBookings) {
        const existingStart = new Date(booking.start_date);
        const existingEnd = new Date(booking.end_date);
        const newStart = new Date(start_date);
        const newEnd = new Date(end_date);

        // Check if dates overlap
        if (newStart <= existingEnd && newEnd >= existingStart) {
          return res.status(409).json({
            error: `Property is unavailable for the selected dates. Already booked from ${booking.start_date} to ${booking.end_date}`,
            code: 'DATE_CONFLICT',
            conflictingDates: {
              start: booking.start_date,
              end: booking.end_date
            }
          });
        }
      }
    }

    // Prepare the data for booked_properties table
    const bookedPropertyData = {
      booking_id: booking_date_id,
      contractor_id: contractorId,
      booking_request_id: bookingRequestId,
      property_id: property_id,
      landlord_id: landlordId,
      start_date,
      end_date,
      project_postcode: postcode,
      team_size,
      contractor_name,
      contractor_email,
      contractor_phone,
      property_name,
      property_type,
      property_address,
      landlord_name,
      landlord_contact,
      value,
      status: 'active'
    };

    // Insert into booked_properties table (using service role - bypasses RLS)
    const { data: insertData, error: insertError } = await supabase
      .from('booked_properties')
      .insert([bookedPropertyData])
      .select();

    if (insertError) {
      console.error('Error inserting into booked_properties:', insertError);
      return res.status(500).json({
        error: 'Failed to create property assignment',
        details: insertError.message
      });
    }

    // Update property availability to false
    const { error: propertyUpdateError } = await supabase
      .from('properties')
      .update({ is_available: false })
      .eq('id', property_id);

    if (propertyUpdateError) {
      console.error('Error updating property availability:', propertyUpdateError);
      // Don't fail the request, just log the error
    }

    // Update booking_dates status to 'confirmed'
    const { error: bookingDateUpdateError } = await supabase
      .from('booking_dates')
      .update({ status: 'confirmed' })
      .eq('id', booking_date_id);

    if (bookingDateUpdateError) {
      console.error('Error updating booking date status:', bookingDateUpdateError);
      // Don't fail the request, just log the error
    }

    // Return success response
    return res.status(201).json({
      success: true,
      message: `Property ${property_id} has been booked from ${new Date(start_date).toLocaleDateString()} to ${new Date(end_date).toLocaleDateString()}`,
      data: insertData[0]
    });

  } catch (error) {
    console.error('Error in property assignment:', error);
    return res.status(500).json({
      error: 'An unexpected error occurred while assigning property',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;

