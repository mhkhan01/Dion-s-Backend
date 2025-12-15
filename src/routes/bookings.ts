import express from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase';
import { authenticateUser, requireContractor, AuthenticatedRequest } from '../middleware/auth';
import { sendWebhookEvent } from '../lib/webhooks';

const router = express.Router();

// Validation schemas
const createBookingSchema = z.object({
  property_id: z.string().uuid(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).refine((data) => new Date(data.end_date) > new Date(data.start_date), {
  message: "End date must be after start date",
  path: ["end_date"],
});

// GET /api/bookings/:id - Get booking details
router.get('/:id', authenticateUser, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    const { data: booking, error } = await supabaseAdmin
      .from('bookings')
      .select(`
        *,
        property:properties(*),
        contractor:profiles!bookings_contractor_id_fkey(*),
        invoice:invoices(*)
      `)
      .eq('id', id)
      .single();

    if (error) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Check if user has permission to view this booking
    if (
      req.user?.role !== 'admin' &&
      booking.contractor_id !== req.user?.id &&
      booking.property.owner_id !== req.user?.id
    ) {
      return res.status(403).json({ error: 'Access denied' });
    }

    return res.json({ booking });
  } catch (error) {
    console.error('Error fetching booking:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/bookings/create - Create new booking
router.post('/create', authenticateUser, requireContractor, async (req: AuthenticatedRequest, res) => {
  try {
    const validatedData = createBookingSchema.parse(req.body);

    // Verify property exists
    const { data: property, error: propertyError } = await supabaseAdmin
      .from('properties')
      .select('*')
      .eq('id', validatedData.property_id)
      .single();

    if (propertyError || !property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    // Create booking
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('bookings')
      .insert({
        property_id: validatedData.property_id,
        contractor_id: req.user!.id,
        start_date: validatedData.start_date,
        end_date: validatedData.end_date,
        status: 'pending',
      })
      .select(`
        *,
        property:properties(*),
        contractor:profiles!bookings_contractor_id_fkey(*)
      `)
      .single();

    if (bookingError) {
      console.error('Error creating booking:', bookingError);
      return res.status(500).json({ error: 'Failed to create booking' });
    }

    // Send webhook event
    await sendWebhookEvent('booking_created', {
      booking_id: booking.id,
      property_id: booking.property_id,
      contractor_id: booking.contractor_id,
      start_date: booking.start_date,
      end_date: booking.end_date,
      property_title: property.title,
      contractor_name: req.user!.full_name,
    });

    return res.status(201).json({ booking });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation error',
        details: error.errors 
      });
    }

    console.error('Error creating booking:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
