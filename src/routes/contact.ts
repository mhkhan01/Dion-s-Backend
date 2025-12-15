import express from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase';

const router = express.Router();

// Validation schema for contact form
const contactSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().min(10, 'Phone number must be at least 10 characters'),
  address: z.string().min(3, 'Address must be at least 3 characters'),
  message: z.string().min(10, 'Message must be at least 10 characters'),
});

// POST /api/contact - Submit contact form
router.post('/', async (req, res) => {
  console.log('=== Contact Form API Called (Backend) ===');
  console.log('Raw request body:', req.body);
  
  try {
    const validatedData = contactSchema.parse(req.body);
    console.log('Request body validated successfully');
    console.log('Received contact form data:', {
      fullName: validatedData.fullName,
      email: validatedData.email,
      phone: validatedData.phone,
      address: validatedData.address,
      message: validatedData.message.substring(0, 50) + '...'
    });

    // Insert contact form data into contact_details table
    console.log('Inserting contact form data into database...');
    const { data, error } = await supabaseAdmin
      .from('contact_details')
      .insert([
        {
          full_name: validatedData.fullName,
          email: validatedData.email,
          phone: validatedData.phone,
          address: validatedData.address,
          message: validatedData.message
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('Database insert error:', error);
      console.error('Error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      
      return res.status(500).json({
        success: false,
        error: `Failed to submit contact form: ${error.message}`
      });
    }

    console.log('Contact form data saved successfully!');

    // Return success response
    return res.status(201).json({
      success: true,
      data: data,
      message: 'Thank you! Your message has been sent successfully.'
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Validation error:', error.errors);
      console.error('Failed validation details:', JSON.stringify(error.errors, null, 2));
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
        message: error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      });
    }

    console.error('=== Error processing contact form ===');
    console.error('Error details:', error);
    
    return res.status(500).json({
      success: false,
      error: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: error instanceof Error ? error.stack : String(error)
    });
  }
});

export default router;

