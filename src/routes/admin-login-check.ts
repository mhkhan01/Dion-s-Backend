import express from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase';

const router = express.Router();

// Validation schema for admin login check
const adminLoginCheckSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

// POST /api/admin-login-check - Check if email exists in admin table
router.post('/', async (req, res) => {
  try {
    const validatedData = adminLoginCheckSchema.parse(req.body);
    
    // Check if email exists in admin table
    const { data: adminData, error: adminError } = await supabaseAdmin
      .from('admin')
      .select('id, email')
      .eq('email', validatedData.email)
      .maybeSingle();

    if (adminError) {
      console.error('Error checking admin table:', adminError);
      return res.status(500).json({
        success: false,
        error: 'Failed to check admin access',
        details: adminError.message
      });
    }

    // If email doesn't exist in admin table, return false
    if (!adminData) {
      return res.status(200).json({
        success: true,
        isAdmin: false,
        message: 'Email not found in admin table'
      });
    }

    // Email exists in admin table
    return res.status(200).json({
      success: true,
      isAdmin: true,
      admin: {
        id: adminData.id,
        email: adminData.email
      }
    });
  } catch (error) {
    console.error('Error in admin login check:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;

