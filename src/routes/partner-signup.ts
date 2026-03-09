import express from 'express';
import { z } from 'zod';
import axios from 'axios';
import { supabaseAdmin } from '../lib/supabase';

const router = express.Router();

// Partner terms version - update this when terms are updated
const PARTNER_TERMS_VERSION = '2024-01-15-v1';

// Validation schema for partner (landlord) signup
const partnerSignupSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().min(10, 'Phone number must be at least 10 characters'),
  companyName: z.string().min(2, 'Company name must be at least 2 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
  termsAccepted: z.boolean().refine((val) => val === true, {
    message: 'You must agree to the partner terms and conditions',
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// POST /api/partner-signup - Create new partner (landlord) account
router.post('/', async (req, res) => {
  console.log('=== Partner Signup API Called (Backend) ===');
  
  try {
    const validatedData = partnerSignupSchema.parse(req.body);
    console.log('Request body validated successfully');
    console.log('Received partner signup data:', {
      fullName: validatedData.fullName,
      email: validatedData.email,
      phone: validatedData.phone,
      companyName: validatedData.companyName
    });

    // Step 0: Validate email doesn't exist in contractor or landlord tables (case-insensitive)
    const normalizedEmail = validatedData.email.toLowerCase().trim();
    
    // Check contractor table
    const { data: existingContractor, error: contractorCheckError } = await supabaseAdmin
      .from('contractor')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (contractorCheckError) {
      console.error('Error checking contractor table:', contractorCheckError);
      return res.status(400).json({
        error: 'This email is already in use, Try a different email.'
      });
    }

    if (existingContractor) {
      console.log('Email already exists in contractor table:', normalizedEmail);
      return res.status(400).json({
        error: 'This email is already in use, Try a different email.'
      });
    }

    // Check landlord table
    const { data: existingLandlord, error: landlordCheckError } = await supabaseAdmin
      .from('landlord')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (landlordCheckError) {
      console.error('Error checking landlord table:', landlordCheckError);
      return res.status(400).json({
        error: 'This email is already in use, Try a different email.'
      });
    }

    if (existingLandlord) {
      console.log('Email already exists in landlord table:', normalizedEmail);
      return res.status(400).json({
        error: 'This email is already in use, Try a different email.'
      });
    }

    // Step 1: Create Supabase Auth account using regular signup (EXACT SAME AS FRONTEND)
    // This automatically sends confirmation emails
    // Use normalized email for consistency
    console.log('Starting Supabase Auth signup...');
    // FRONTEND_URL must be set to the production app URL (e.g. https://app.booking-hub.co.uk)
    // in the backend's environment variables. When it is missing or left as the
    // default localhost value the email-confirmation link will point to localhost,
    // confusing users — even though Supabase still marks the email as confirmed
    // server-side, they never land back on the correct page after verification.
    const frontendUrl =
      process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes('localhost')
        ? process.env.FRONTEND_URL
        : 'https://app.booking-hub.co.uk';

    const { data: authData, error: authError } = await supabaseAdmin.auth.signUp({
      email: normalizedEmail,
      password: validatedData.password,
      options: {
        emailRedirectTo: `${frontendUrl}/partner`,
        data: {
          role: 'landlord',
          full_name: validatedData.fullName,
          phone: validatedData.phone,
          company_name: validatedData.companyName
        }
      }
    });

    console.log('Supabase Auth signup result:', { authData, authError });

    if (authError) {
      console.error('Auth signup error:', authError);
      // Check if error is related to duplicate email
      if (authError.message.includes('User already registered') ||
          authError.message.includes('duplicate') ||
          authError.message.includes('email') ||
          authError.message.includes('unique constraint') ||
          authError.message.includes('already exists')) {
        return res.status(400).json({
          error: 'This email is already in use, Try a different email.'
        });
      } else {
        return res.status(400).json({
          error: `Signup failed: ${authError.message}`
        });
      }
    }

    if (!authData.user) {
      console.error('No user returned from signup');
      return res.status(500).json({
        error: 'Signup failed: No user account was created. Please try again.'
      });
    }

    // Verify user was actually created in auth.users
    const userId = authData.user.id;
    console.log('Auth user created with ID:', userId);
    console.log('Confirmation email sent automatically by Supabase');

    // Save checkbox agreement value to partner_terms_accepted_ip column (text type)
    const termsAgreementValue = validatedData.termsAccepted ? 'agreed' : 'not agreed';

    // Step 2: Create landlord profile in landlord table (EXACT SAME PATTERN AS FRONTEND)
    console.log('Creating landlord profile with data:', {
      id: userId,
      email: validatedData.email,
      full_name: validatedData.fullName,
      phone: validatedData.phone,
      company_name: validatedData.companyName,
      role: 'landlord',
      partner_terms_accepted_at: new Date().toISOString(),
      partner_terms_version: PARTNER_TERMS_VERSION,
      partner_terms_accepted_ip: termsAgreementValue,
    });

    const { data: landlordData, error: profileError } = await supabaseAdmin
      .from('landlord')
      .insert({
        id: userId,
        email: normalizedEmail,
        full_name: validatedData.fullName,
        phone: validatedData.phone,
        contact_number: validatedData.phone,
        company_name: validatedData.companyName,
        role: 'landlord',
        is_active: true,
        email_verified: false,
        partner_terms_accepted_at: new Date().toISOString(),
        partner_terms_version: PARTNER_TERMS_VERSION,
        partner_terms_accepted_ip: termsAgreementValue,
      })
      .select()
      .single();

    console.log('Landlord profile insert result:', { profileError });

    if (profileError) {
      console.error('Profile creation error:', profileError);
      console.error('Error details:', {
        message: profileError.message,
        details: profileError.details,
        hint: profileError.hint,
        code: profileError.code
      });
      
      // Check if error is related to duplicate email
      if (profileError.message.includes('duplicate') ||
          profileError.message.includes('email') ||
          profileError.message.includes('unique constraint') ||
          profileError.message.includes('already exists')) {
        return res.status(400).json({
          error: 'This email is already in use, Try a different email.'
        });
      }
      
      return res.status(500).json({
        error: `Failed to create user profile: ${profileError.message}. Please contact support.`
      });
    }

    console.log('Landlord profile created successfully!');

    // Step 3: Send data to GHL webhook
    const ghlWebhookUrl = process.env.GHL_PARTNER_SIGNUP_WEBHOOK_URL;
    
    if (ghlWebhookUrl) {
      try {
        const ghlPayload = {
          full_name: validatedData.fullName,
          email: normalizedEmail,
          phone: validatedData.phone,
          company_name: validatedData.companyName,
          role: 'landlord',
          user_id: userId,
          is_active: true,
          email_verified: false,
          created_at: new Date().toISOString(),
          source: 'booking_hub_landlord_signup',
          timestamp: new Date().toISOString()
        };

        console.log('Sending to GHL:', ghlPayload);

        const ghlResponse = await axios.post(ghlWebhookUrl, ghlPayload, {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
          },
        });

        console.log('GHL Response status:', ghlResponse.status);
        console.log('Landlord signup data sent to GHL successfully');
      } catch (ghlError) {
        console.error('Error sending to GHL:', ghlError);
        // Don't fail the request if GHL fails - user is still created
      }
    } else {
      console.warn('GHL_PARTNER_SIGNUP_WEBHOOK_URL not configured, skipping GHL webhook');
    }

    console.log('All operations completed successfully');

    // Return success response (same format as frontend)
    return res.status(201).json({
      success: true,
      landlord: landlordData,
      message: 'Account created successfully! Please check your email to confirm your account.'
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Validation error:', error.errors);
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors
      });
    }

    console.error('=== Error processing partner signup ===');
    console.error('Error details:', error);
    
    return res.status(500).json({
      success: false,
      error: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: error instanceof Error ? error.stack : String(error)
    });
  }
});

// POST /api/partner-signup/resend - Resend confirmation email
router.post('/resend', async (req, res) => {
  console.log('=== Resend Confirmation Email API Called (Partner) ===');

  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Look up the landlord record to get the auth user ID
    const { data: landlord, error: landlordError } = await supabaseAdmin
      .from('landlord')
      .select('id')
      .eq('email', normalizedEmail)
      .single();

    if (landlordError || !landlord) {
      console.log('Landlord not found for email:', normalizedEmail);
      // Return a generic success to avoid leaking whether an account exists
      return res.status(200).json({ success: true });
    }

    // Fetch the auth user to check confirmation status
    const { data: authUserData, error: authUserError } = await supabaseAdmin.auth.admin.getUserById(landlord.id);

    if (authUserError || !authUserData?.user) {
      console.error('Auth user not found for landlord:', landlord.id, authUserError);
      return res.status(400).json({ error: 'Unable to find the associated account. Please try signing up again.' });
    }

    const authUser = authUserData.user;

    // If the email is already confirmed, return a specific error
    if (authUser.email_confirmed_at) {
      console.log('Email already confirmed for:', normalizedEmail);
      return res.status(400).json({ error: 'This email is confirmed. You can login to your account' });
    }

    // Resend the confirmation email via supabaseAdmin
    const frontendUrl =
      process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes('localhost')
        ? process.env.FRONTEND_URL
        : 'https://app.booking-hub.co.uk';

    const { error: resendError } = await supabaseAdmin.auth.resend({
      type: 'signup',
      email: normalizedEmail,
      options: {
        emailRedirectTo: `${frontendUrl}/partner`,
      },
    });

    if (resendError) {
      console.error('Supabase resend error (partner):', resendError);

      const isRateLimit =
        (resendError as { status?: number }).status === 429 ||
        resendError.message?.toLowerCase().includes('rate limit') ||
        resendError.message?.toLowerCase().includes('60 seconds') ||
        (resendError as { code?: string }).code === 'over_email_send_rate_limit';

      if (isRateLimit) {
        return res.status(429).json({
          error: 'Too many requests. You can only resend a confirmation email once every 60 seconds. Please wait a moment and try again.',
        });
      }

      return res.status(400).json({ error: 'Failed to resend confirmation email. Please try again.' });
    }

    console.log('Confirmation email resent successfully to partner:', normalizedEmail);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('=== Error in resend confirmation (partner) ===', error);
    return res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
  }
});

export default router;
