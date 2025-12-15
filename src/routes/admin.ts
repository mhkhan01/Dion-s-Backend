import express from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase';
import { authenticateUser, requireAdmin, AuthenticatedRequest } from '../middleware/auth';
import { sendWebhookEvent } from '../lib/webhooks';

const router = express.Router();

// Validation schemas
const confirmBookingSchema = z.object({
  status: z.enum(['confirmed', 'cancelled']),
});

// GET /api/admin/bookings - Get all bookings (admin only)
router.get('/bookings', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { page = '1', limit = '20', status } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    let query = supabaseAdmin
      .from('bookings')
      .select(`
        *,
        property:properties(*),
        contractor:profiles!bookings_contractor_id_fkey(*),
        invoice:invoices(*)
      `)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data: bookings, error, count } = await query
      .range(offset, offset + parseInt(limit as string) - 1);

    if (error) {
      console.error('Error fetching bookings:', error);
      return res.status(500).json({ error: 'Failed to fetch bookings' });
    }

    return res.json({
      bookings,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total: count || 0,
        pages: Math.ceil((count || 0) / parseInt(limit as string)),
      },
    });
  } catch (error) {
    console.error('Error fetching admin bookings:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/admin/bookings/:id/confirm - Confirm/cancel booking (admin only)
router.put('/bookings/:id/confirm', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const validatedData = confirmBookingSchema.parse(req.body);

    // Get current booking
    const { data: currentBooking, error: fetchError } = await supabaseAdmin
      .from('bookings')
      .select(`
        *,
        property:properties(*),
        contractor:profiles!bookings_contractor_id_fkey(*)
      `)
      .eq('id', id)
      .single();

    if (fetchError || !currentBooking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Update booking status
    const { data: booking, error: updateError } = await supabaseAdmin
      .from('bookings')
      .update({ 
        status: validatedData.status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select(`
        *,
        property:properties(*),
        contractor:profiles!bookings_contractor_id_fkey(*),
        invoice:invoices(*)
      `)
      .single();

    if (updateError) {
      console.error('Error updating booking:', updateError);
      return res.status(500).json({ error: 'Failed to update booking' });
    }

    // Send webhook event
    await sendWebhookEvent('booking_confirmed', {
      booking_id: booking.id,
      property_id: booking.property_id,
      contractor_id: booking.contractor_id,
      status: validatedData.status,
      property_title: booking.property.title,
      contractor_name: booking.contractor.full_name,
      admin_name: req.user!.full_name,
    });

    return res.json({ booking });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation error',
        details: error.errors 
      });
    }

    console.error('Error confirming booking:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/dashboard - Get admin dashboard stats
router.get('/dashboard', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    // Get total counts
    const [
      { count: totalBookings },
      { count: totalProperties },
      { count: totalUsers },
      { count: pendingBookings },
      { count: paidBookings },
    ] = await Promise.all([
      supabaseAdmin.from('bookings').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('properties').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabaseAdmin.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'paid'),
    ]);

    // Get recent bookings
    const { data: recentBookings } = await supabaseAdmin
      .from('bookings')
      .select(`
        *,
        property:properties(title),
        contractor:profiles!bookings_contractor_id_fkey(full_name)
      `)
      .order('created_at', { ascending: false })
      .limit(5);

    return res.json({
      stats: {
        totalBookings,
        totalProperties,
        totalUsers,
        pendingBookings,
        paidBookings,
      },
      recentBookings,
    });
  } catch (error) {
    console.error('Error fetching admin dashboard:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
