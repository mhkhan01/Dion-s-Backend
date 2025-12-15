import express from 'express';
import { z } from 'zod';
import axios from 'axios';
import { supabaseAdmin } from '../lib/supabase';

const router = express.Router();

// Validation schema for client (contractor) signup
const clientSignupSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().min(10, 'Phone number must be at least 10 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// POST /api/client-signup - Create new client (contractor) account
router.post('/', async (req, res) => {
  console.log('=== Client Signup API Called (Backend) ===');
  
  try {
    const validatedData = clientSignupSchema.parse(req.body);
    console.log('Request body validated successfully');
    console.log('Received client signup data:', {
      fullName: validatedData.fullName,
      email: validatedData.email,
      phone: validatedData.phone
    });

    // Step 0: Validate email doesn't exist in contractor or landlord tables (case-insensitive)
    const normalizedEmail = validatedData.email.toLowerCase().trim();
    
    // Check contractor table
    const { data: contractorsForValidation, error: contractorCheckError } = await supabaseAdmin
      .from('contractor')
      .select('id, email');

    if (contractorCheckError) {
      console.error('Error checking contractor table:', contractorCheckError);
      return res.status(400).json({
        error: 'This email is already in use, Try a different email.'
      });
    }

    if (contractorsForValidation && Array.isArray(contractorsForValidation)) {
      const existingContractor = contractorsForValidation.find(
        (c) => {
          if (!c || !c.email) return false;
          const dbEmail = String(c.email).toLowerCase().trim();
          return dbEmail === normalizedEmail;
        }
      );
      if (existingContractor) {
        console.log('Email already exists in contractor table:', normalizedEmail);
        return res.status(400).json({
          error: 'This email is already in use, Try a different email.'
        });
      }
    }

    // Check landlord table
    const { data: existingLandlords, error: landlordCheckError } = await supabaseAdmin
      .from('landlord')
      .select('id, email');

    if (landlordCheckError) {
      console.error('Error checking landlord table:', landlordCheckError);
      return res.status(400).json({
        error: 'This email is already in use, Try a different email.'
      });
    }

    if (existingLandlords && Array.isArray(existingLandlords)) {
      const existingLandlord = existingLandlords.find(
        (l) => {
          if (!l || !l.email) return false;
          const dbEmail = String(l.email).toLowerCase().trim();
          return dbEmail === normalizedEmail;
        }
      );
      if (existingLandlord) {
        console.log('Email already exists in landlord table:', normalizedEmail);
        return res.status(400).json({
          error: 'This email is already in use, Try a different email.'
        });
      }
    }

    // Step 1: Create Supabase Auth account using regular signup (EXACT SAME AS FRONTEND)
    // This automatically sends confirmation emails
    // Use normalized email for consistency
    console.log('Starting Supabase Auth signup...');
    const { data: authData, error: authError } = await supabaseAdmin.auth.signUp({
      email: normalizedEmail,
      password: validatedData.password,
      options: {
        emailRedirectTo: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/contractor`,
        data: {
          role: 'contractor',
          full_name: validatedData.fullName
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

    // Step 2: Create contractor profile in contractor table (EXACT SAME PATTERN AS FRONTEND)
    console.log('Creating contractor profile with data:', {
      id: userId,
      email: validatedData.email,
      full_name: validatedData.fullName,
      phone: validatedData.phone,
      role: 'contractor',
    });

    const { data: contractorData, error: profileError } = await supabaseAdmin
      .from('contractor')
      .insert({
        id: userId,
        email: normalizedEmail,
        full_name: validatedData.fullName,
        phone: validatedData.phone,
        role: 'contractor',
        is_active: true,
        email_verified: false
      })
      .select()
      .single();

    console.log('Contractor profile insert result:', { profileError });

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

    console.log('Contractor profile created successfully!');

    // Step 3: Send data to GHL webhook (if configured)
    const ghlWebhookUrl = process.env.GHL_CLIENT_SIGNUP_WEBHOOK_URL;
    
    if (ghlWebhookUrl) {
      try {
        const ghlPayload = {
          full_name: validatedData.fullName,
          email: normalizedEmail,
          phone: validatedData.phone,
          role: 'contractor',
          user_id: userId,
          is_active: true,
          email_verified: false,
          created_at: new Date().toISOString(),
          source: 'booking_hub_client_signup',
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
        console.log('Client signup data sent to GHL successfully');
      } catch (ghlError) {
        console.error('Error sending to GHL:', ghlError);
        // Don't fail the request if GHL fails - user is still created
      }
    } else {
      console.warn('GHL_CLIENT_SIGNUP_WEBHOOK_URL not configured, skipping GHL webhook');
    }

    console.log('All operations completed successfully');

    // Return success response (same format as frontend)
    return res.status(201).json({
      success: true,
      contractor: contractorData,
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

    console.error('=== Error processing client signup ===');
    console.error('Error details:', error);
    
    return res.status(500).json({
      success: false,
      error: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: error instanceof Error ? error.stack : String(error)
    });
  }
});

export default router;





