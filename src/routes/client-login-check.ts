import express from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase';

const router = express.Router();

// Validation schema for client login check
const clientLoginCheckSchema = z.object({
  userId: z.string().uuid('Please provide a valid user ID'),
});

// POST /api/client-login-check - Check if contractor is active
router.post('/', async (req, res) => {
  try {
    const validatedData = clientLoginCheckSchema.parse(req.body);
    
    // Check if contractor exists and is active
    const { data: contractorData, error: contractorError } = await supabaseAdmin
      .from('contractor')
      .select('id, email, is_active')
      .eq('id', validatedData.userId)
      .maybeSingle();

    if (contractorError) {
      console.error('Error checking contractor table:', contractorError);
      return res.status(500).json({
        success: false,
        error: 'Failed to check contractor status',
        details: contractorError.message
      });
    }

    // If contractor doesn't exist
    if (!contractorData) {
      return res.status(200).json({
        success: true,
        exists: false,
        isActive: false,
        message: 'Contractor not found'
      });
    }

    // Check if contractor is active
    if (contractorData.is_active === false) {
      return res.status(200).json({
        success: true,
        exists: true,
        isActive: false,
        message: 'Your account is inactive. Ask the admin to activate it.'
      });
    }

    // Contractor exists and is active
    return res.status(200).json({
      success: true,
      exists: true,
      isActive: true,
      contractor: {
        id: contractorData.id,
        email: contractorData.email
      }
    });
  } catch (error) {
    console.error('Error in client login check:', error);
    
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
