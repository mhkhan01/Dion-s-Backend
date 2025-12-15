import Stripe from 'stripe';

// Make Stripe optional - only initialize if key is provided
export const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    })
  : null;

export const createCheckoutSession = async (
  bookingId: string,
  amount: number,
  successUrl: string,
  cancelUrl: string
) => {
  if (!stripe) {
    throw new Error('Stripe is not configured. Please add STRIPE_SECRET_KEY to environment variables.');
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Property Booking',
            description: `Booking ID: ${bookingId}`,
          },
          unit_amount: Math.round(amount * 100), // Convert to cents
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      bookingId,
    },
  });

  return session;
};

export const constructWebhookEvent = (body: string | Buffer, signature: string) => {
  if (!stripe) {
    throw new Error('Stripe is not configured. Please add STRIPE_SECRET_KEY to environment variables.');
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    throw new Error('Missing STRIPE_WEBHOOK_SECRET environment variable');
  }

  return stripe.webhooks.constructEvent(body, signature, webhookSecret);
};