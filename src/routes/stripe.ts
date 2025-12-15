import express from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase';
import { createCheckoutSession, constructWebhookEvent, stripe } from '../lib/stripe';
import { sendWebhookEvent } from '../lib/webhooks';

const router = express.Router();

// Validation schema
const createSessionSchema = z.object({
  booking_id: z.string().uuid(),
});

// POST /api/stripe/create-session - Create Stripe checkout session
router.post('/create-session', async (req, res) => {
  try {
    const validatedData = createSessionSchema.parse(req.body);

    // Get booking details
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('bookings')
      .select(`
        *,
        property:properties(*)
      `)
      .eq('id', validatedData.booking_id)
      .single();

    if (bookingError || !booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Calculate total amount (price * number of days)
    const startDate = new Date(booking.start_date);
    const endDate = new Date(booking.end_date);
    const numberOfDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const totalAmount = booking.property.price * numberOfDays;

    // Create Stripe checkout session
    const session = await createCheckoutSession(
      booking.id,
      totalAmount,
      `${process.env.FRONTEND_URL}/contractor?payment=success`,
      `${process.env.FRONTEND_URL}/contractor?payment=cancelled`
    );

    // Create invoice record
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .insert({
        booking_id: booking.id,
        stripe_session_id: session.id,
        stripe_payment_url: session.url,
        amount: totalAmount,
        status: 'unpaid',
      })
      .select()
      .single();

    if (invoiceError) {
      console.error('Error creating invoice:', invoiceError);
      return res.status(500).json({ error: 'Failed to create invoice' });
    }

    return res.json({ 
      session_id: session.id,
      payment_url: session.url,
      invoice 
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation error',
        details: error.errors 
      });
    }

    console.error('Error creating Stripe session:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/stripe/webhook - Handle Stripe webhooks
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['stripe-signature'] as string;
    
    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe signature' });
    }

    const event = constructWebhookEvent(req.body, signature);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const bookingId = session.metadata?.bookingId;

        if (!bookingId) {
          console.error('Missing bookingId in session metadata');
          return res.status(400).json({ error: 'Missing booking ID' });
        }

        // Update invoice status
        const { error: invoiceError } = await supabaseAdmin
          .from('invoices')
          .update({ 
            status: 'paid',
            updated_at: new Date().toISOString()
          })
          .eq('stripe_session_id', session.id);

        if (invoiceError) {
          console.error('Error updating invoice:', invoiceError);
          return res.status(500).json({ error: 'Failed to update invoice' });
        }

        // Update booking status
        const { error: bookingError } = await supabaseAdmin
          .from('bookings')
          .update({ 
            status: 'paid',
            updated_at: new Date().toISOString()
          })
          .eq('id', bookingId);

        if (bookingError) {
          console.error('Error updating booking:', bookingError);
          return res.status(500).json({ error: 'Failed to update booking' });
        }

        // Send webhook event
        await sendWebhookEvent('payment_succeeded', {
          booking_id: bookingId,
          stripe_session_id: session.id,
          amount_paid: (session.amount_total || 0) / 100, // Convert from cents
          payment_status: session.payment_status,
        });

        console.log(`Payment succeeded for booking ${bookingId}`);
        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object;
        const bookingId = session.metadata?.bookingId;

        if (bookingId) {
          await sendWebhookEvent('payment_expired', {
            booking_id: bookingId,
            stripe_session_id: session.id,
          });
        }

        console.log(`Payment session expired for booking ${bookingId}`);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return res.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }
});

export default router;
