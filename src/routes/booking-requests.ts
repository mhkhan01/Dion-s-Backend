import express from 'express';
import { z } from 'zod';
import axios from 'axios';
import { supabaseAdmin } from '../lib/supabase';

const router = express.Router();

// Validation schema for booking request
const bookingRequestSchema = z.object({
  fullName: z.string().min(1),
  companyName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  projectPostcode: z.string().optional(),
  password: z.string().min(6),
  bookings: z.array(z.object({
    startDate: z.string(),
    endDate: z.string()
  })),
  teamSize: z.number().nullable().optional(),
  budgetPerPerson: z.string().optional(),
  city: z.string().optional()
});

// POST /api/booking-requests - Create new booking request with contractor signup
router.post('/', async (req, res) => {
  console.log('=== Booking Request API Called (Backend) ===');
  
  try {
    const validatedData = bookingRequestSchema.parse(req.body);
    console.log('Request body validated successfully');
    console.log('Received booking request data:', {
      fullName: validatedData.fullName,
      companyName: validatedData.companyName,
      email: validatedData.email,
      phone: validatedData.phone,
      projectPostcode: validatedData.projectPostcode,
      bookings: validatedData.bookings,
      teamSize: validatedData.teamSize,
      budgetPerPerson: validatedData.budgetPerPerson,
      city: validatedData.city
    });

    // Step 1: Create Supabase Auth account using regular signup
    // This automatically sends confirmation emails
    const { data: authData, error: authError } = await supabaseAdmin.auth.signUp({
      email: validatedData.email,
      password: validatedData.password,
      options: {
        emailRedirectTo: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/contractor`,
        data: {
          role: 'contractor',
          full_name: validatedData.fullName
        }
      }
    });

    if (authError) {
      console.error('Auth signup error:', authError);
      return res.status(400).json({
        error: `Authentication failed: ${authError.message}`
      });
    }

    if (!authData.user) {
      return res.status(500).json({
        error: 'Failed to create user account'
      });
    }

    console.log('Auth user created successfully:', authData.user.id);
    console.log('Confirmation email sent automatically by Supabase');

    // Step 2: Generate unique contractor code
    const { data: existingContractors, error: fetchError } = await supabaseAdmin
      .from('contractor')
      .select('code')
      .not('code', 'is', null)
      .order('code', { ascending: false });

    let nextNumber = 1;
    
    if (existingContractors && existingContractors.length > 0) {
      const existingNumbers = existingContractors
        .map((c: any) => {
          const match = c.code?.match(/CT-(\d+)/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter(num => num > 0);
      
      if (existingNumbers.length > 0) {
        nextNumber = Math.max(...existingNumbers) + 1;
      }
    }

    const contractorCode = `CT-${nextNumber}`;
    console.log('Generated contractor code:', contractorCode);

    // Step 3: Create contractor profile in contractor table
    const { data: contractorData, error: contractorError } = await supabaseAdmin
      .from('contractor')
      .insert({
        id: authData.user.id,
        email: validatedData.email,
        full_name: validatedData.fullName,
        company_name: validatedData.companyName,
        company_email: validatedData.email,
        phone: validatedData.phone,
        code: contractorCode,
        role: 'contractor',
        is_active: true,
        email_verified: false
      })
      .select()
      .single();

    if (contractorError) {
      console.error('Error creating contractor profile:', contractorError);
      return res.status(500).json({
        error: `Failed to create contractor profile: ${contractorError.message}`
      });
    }

    console.log('Contractor profile created successfully:', contractorData);

    // Step 4: Create booking request
    const { data: bookingRequest, error: requestError } = await supabaseAdmin
      .from('booking_requests')
      .insert({
        user_id: authData.user.id,
        full_name: validatedData.fullName,
        company_name: validatedData.companyName,
        email: validatedData.email,
        project_postcode: validatedData.projectPostcode,
        team_size: validatedData.teamSize,
        budget_per_person_week: validatedData.budgetPerPerson,
        status: 'pending',
        city: validatedData.city
      })
      .select()
      .single();

    if (requestError) {
      console.error('Error creating booking request:', requestError);
      return res.status(500).json({
        error: `Failed to create booking request: ${requestError.message}`
      });
    }

    console.log('Booking request created successfully:', bookingRequest);

    // Step 5: Create booking dates for each booking
    let datesData: any[] = [];
    if (validatedData.bookings && validatedData.bookings.length > 0) {
      const bookingDates = validatedData.bookings
        .filter((booking: any) => booking.startDate && booking.endDate)
        .map((booking: any) => {
          const startDate = new Date(booking.startDate);
          const endDate = new Date(booking.endDate);
          
          if (startDate >= endDate) {
            throw new Error(`Invalid date range: start date ${booking.startDate} must be before end date ${booking.endDate}`);
          }
          
          return {
            booking_request_id: bookingRequest.id,
            start_date: booking.startDate,
            end_date: booking.endDate
          };
        });

      console.log('Preparing to insert booking dates:', bookingDates);

      if (bookingDates.length > 0) {
        const { data: createdDates, error: datesError } = await supabaseAdmin
          .from('booking_dates')
          .insert(bookingDates)
          .select();

        if (datesError) {
          console.error('Error creating booking dates:', datesError);
          return res.status(500).json({
            error: `Failed to create booking dates: ${datesError.message}. Details: ${datesError.details || 'No additional details'}`
          });
        }

        datesData = createdDates || [];
        console.log('Booking dates created successfully:', datesData);
      }
    }

    // Step 6: Send data to GHL webhook for each booking date
    const ghlWebhookUrl = process.env.GHL_BOOKING_REQUEST_WEBHOOK_URL;
    
    if (ghlWebhookUrl) {
      try {
        for (let i = 0; i < validatedData.bookings.length; i++) {
          const booking = validatedData.bookings[i];
          const createdBookingDate = datesData[i];
          
          const ghlPayload = {
            fullName: validatedData.fullName,
            companyName: validatedData.companyName,
            email: validatedData.email,
            phone: validatedData.phone,
            projectPostcode: validatedData.projectPostcode,
            city: validatedData.city,
            [`booking_${i + 1}`]: `${booking.startDate} to ${booking.endDate}`,
            teamSize: validatedData.teamSize,
            budgetPerPerson: validatedData.budgetPerPerson,
            role: 'contractor',
            bookingId: createdBookingDate?.id || `booking_${i + 1}`,
            bookingStartDate: booking.startDate,
            bookingEndDate: booking.endDate
          };

          console.log(`Sending GHL data for booking ${i + 1}:`, ghlPayload);

          await axios.post(ghlWebhookUrl, ghlPayload, {
            timeout: 10000,
            headers: {
              'Content-Type': 'application/json',
            },
          });

          console.log(`GHL data sent successfully for booking ${i + 1}`);
        }
      } catch (ghlError) {
        console.error('Error sending to GHL:', ghlError);
        // Don't fail the request if GHL fails
      }
    } else {
      console.warn('GHL_BOOKING_REQUEST_WEBHOOK_URL not configured, skipping GHL webhook');
    }

    console.log('All operations completed successfully');
    
    return res.status(201).json({
      success: true,
      contractor: contractorData,
      bookingRequest,
      bookingDates: datesData || [],
      message: 'Account created and booking request submitted successfully'
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Validation error:', error.errors);
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors
      });
    }

    console.error('=== Error processing booking request ===');
    console.error('Error details:', error);
    
    return res.status(500).json({
      success: false,
      error: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: error instanceof Error ? error.stack : String(error)
    });
  }
});

export default router;

