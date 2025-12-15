import express from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase';

const router = express.Router();

// Validation schema for admin signup
const adminSignupSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// POST /api/admin-signup - Create new admin account
router.post('/', async (req, res) => {
  console.log('=== Admin Signup API Called (Backend) ===');
  
  try {
    const validatedData = adminSignupSchema.parse(req.body);
    console.log('Request body validated successfully');
    console.log('Received admin signup data:', {
      fullName: validatedData.fullName,
      email: validatedData.email
    });

    // Step 1: Check if email already exists in admin table (same role)
    try {
      const { data: existingAdmin, error: adminCheckError } = await supabaseAdmin
        .from('admin')
        .select('id, email')
        .eq('email', validatedData.email)
        .maybeSingle();

      if (existingAdmin && !adminCheckError) {
        return res.status(400).json({
          error: 'Email already in use'
        });
      }
    } catch (adminCheckError) {
      console.log('Admin table check failed:', adminCheckError);
      // Continue with signup even if check fails
    }

    // Step 2: Check if email already exists in contractor or landlord tables (cross-table validation)
    try {
      const { data: existingContractor, error: contractorCheckError } = await supabaseAdmin
        .from('contractor')
        .select('id, email')
        .eq('email', validatedData.email)
        .maybeSingle();

      if (existingContractor && !contractorCheckError) {
        return res.status(400).json({
          error: 'This email is already in use. Try using a different email.'
        });
      }
    } catch (contractorCheckError) {
      console.log('Contractor table check failed:', contractorCheckError);
      // Continue with signup even if check fails
    }

    // Step 3: Check if email exists in landlord table
    try {
      const { data: existingLandlord, error: landlordCheckError } = await supabaseAdmin
        .from('landlord')
        .select('id, email')
        .eq('email', validatedData.email)
        .maybeSingle();

      if (existingLandlord && !landlordCheckError) {
        return res.status(400).json({
          error: 'This email is already in use. Try using a different email.'
        });
      }
    } catch (landlordCheckError) {
      console.log('Landlord table check failed:', landlordCheckError);
      // Continue with signup even if check fails
    }

    // Step 4: Sign up with Supabase Auth (EXACT SAME AS FRONTEND)
    console.log('Starting Supabase Auth signup...');
    const { data: authData, error: authError } = await supabaseAdmin.auth.signUp({
      email: validatedData.email,
      password: validatedData.password,
      options: {
        emailRedirectTo: `${process.env.ADMIN_FRONTEND_URL || 'http://localhost:3002'}/auth/login`,
        data: {
          role: 'admin',
          full_name: validatedData.fullName
        }
      }
    });

    console.log('Supabase Auth signup result:', { authData, authError });

    if (authError) {
      console.error('Auth signup error:', authError);
      
      // Handle specific error types (same as frontend)
      if (authError.message.includes('User already registered')) {
        return res.status(400).json({
          error: 'This email is already registered. Please try logging in instead.'
        });
      } else if (authError.message.includes('Invalid email')) {
        return res.status(400).json({
          error: 'Please enter a valid email address.'
        });
      } else if (authError.message.includes('Password should be at least')) {
        return res.status(400).json({
          error: 'Password must be at least 6 characters long.'
        });
      } else {
        return res.status(400).json({
          error: `Signup failed: ${authError.message}`
        });
      }
    }

    if (!authData.user) {
      return res.status(500).json({
        error: 'Failed to create user account'
      });
    }

    const userId = authData.user.id;
    console.log('Admin user created successfully:', userId);
    console.log('Confirmation email sent automatically by Supabase');

    // Step 5: Check if user was created in admin table (via trigger)
    const { data: adminProfile, error: checkError } = await supabaseAdmin
      .from('admin')
      .select('id, email, full_name')
      .eq('id', userId)
      .single();

    console.log('Admin profile check:', { adminProfile, checkError });

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking admin profile:', checkError);
    }

    // Step 6: If profile doesn't exist, create it manually (fallback)
    let adminData = adminProfile;

    if (!adminProfile) {
      console.log('Creating admin profile manually...');
      
      // Build insert data object (exclude role if column doesn't exist yet)
      const insertData: {
        id: string;
        email: string;
        full_name: string;
        is_active: boolean;
        email_verified: boolean;
      } = {
        id: userId,
        email: validatedData.email,
        full_name: validatedData.fullName,
        is_active: true,
        email_verified: false
      };

      // Try to insert with role first
      let result = await supabaseAdmin
        .from('admin')
        .insert({
          ...insertData,
          role: 'admin'
        })
        .select()
        .single();

      // If it fails due to role/password column not existing, try without them
      if (result.error && (result.error.message?.includes('role') || result.error.message?.includes('password'))) {
        console.log('Role or password column not found, inserting without them...');
        result = await supabaseAdmin
          .from('admin')
          .insert(insertData)
          .select()
          .single();
      }

      console.log('Admin profile insert result:', { data: result.data, error: result.error });

      if (result.error) {
        console.error('Profile creation error:', result.error);
        console.error('Error details:', {
          message: result.error.message,
          details: result.error.details,
          hint: result.error.hint,
          code: result.error.code
        });
        // Don't fail the signup if profile creation fails
        // The user can still login, profile will be created later
      } else {
        console.log('Admin profile created successfully:', result.data);
        adminData = result.data;
      }
    }

    console.log('All operations completed successfully');

    // Return success response
    return res.status(201).json({
      success: true,
      admin: adminData,
      message: 'Signed up successfully! Please check your email to confirm your account before signing in.'
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Validation error:', error.errors);
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors
      });
    }

    console.error('=== Error processing admin signup ===');
    console.error('Error details:', error);
    
    return res.status(500).json({
      success: false,
      error: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: error instanceof Error ? error.stack : String(error)
    });
  }
});

export default router;



