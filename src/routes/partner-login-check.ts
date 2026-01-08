import express from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase';

const router = express.Router();

// Validation schema for partner login check
const partnerLoginCheckSchema = z.object({
  userId: z.string().uuid('Please provide a valid user ID'),
});

// POST /api/partner-login-check - Check if landlord is active
router.post('/', async (req, res) => {
  try {
    const validatedData = partnerLoginCheckSchema.parse(req.body);
    
    // Check if landlord exists and is active
    const { data: landlordData, error: landlordError } = await supabaseAdmin
      .from('landlord')
      .select('id, email, is_active')
      .eq('id', validatedData.userId)
      .maybeSingle();

    if (landlordError) {
      console.error('Error checking landlord table:', landlordError);
      return res.status(500).json({
        success: false,
        error: 'Failed to check landlord status',
        details: landlordError.message
      });
    }

    // If landlord doesn't exist
    if (!landlordData) {
      return res.status(200).json({
        success: true,
        exists: false,
        isActive: false,
        message: 'Landlord not found'
      });
    }

    // Check if landlord is active
    if (landlordData.is_active === false) {
      return res.status(200).json({
        success: true,
        exists: true,
        isActive: false,
        message: 'Your account is inactive. Ask the admin to activate it.'
      });
    }

    // Landlord exists and is active
    return res.status(200).json({
      success: true,
      exists: true,
      isActive: true,
      landlord: {
        id: landlordData.id,
        email: landlordData.email
      }
    });
  } catch (error) {
    console.error('Error in partner login check:', error);
    
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
