import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { authenticateUser, requireAdmin, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// GET /api/properties - Get all properties with landlord information (admin only)
router.get('/', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Fetch all properties with landlord join (using service role - bypasses RLS)
    const { data: properties, error } = await supabase
      .from('properties')
      .select(`
        *,
        landlord:landlord_id (
          id,
          full_name,
          email,
          role,
          company_name,
          company_email,
          company_address,
          contact_number,
          phone,
          created_at,
          updated_at
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching properties:', error);
      return res.status(500).json({
        error: 'Failed to fetch properties',
        details: error.message
      });
    }

    // Map properties to include owner data
    const propertiesWithOwners = (properties || []).map((property: any) => {
      return {
        ...property,
        owner: property.landlord || {
          id: property.landlord_id || 'unknown',
          full_name: 'Property Owner',
          email: 'owner@example.com',
          role: 'landlord',
          created_at: property.created_at || new Date().toISOString(),
          updated_at: property.updated_at || new Date().toISOString()
        }
      };
    });

    return res.status(200).json({
      success: true,
      data: propertiesWithOwners,
      count: propertiesWithOwners.length
    });

  } catch (error) {
    console.error('Error in properties endpoint:', error);
    return res.status(500).json({
      error: 'An unexpected error occurred while fetching properties',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/properties/stats - Get dashboard statistics
router.get('/stats', async (req: Request, res: Response) => {
  try {
    // Get total properties count
    const { count: totalProperties } = await supabase
      .from('properties')
      .select('*', { count: 'exact', head: true });

    // Get available properties count
    const { count: availableProperties } = await supabase
      .from('properties')
      .select('*', { count: 'exact', head: true })
      .eq('is_available', true);

    // Get booking statistics based on booking_dates status
    const [
      { count: pendingBookingDates },
      { count: activeBookingsCount },
      { count: confirmedBookingDates }
    ] = await Promise.all([
      supabase.from('booking_dates').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('booked_properties').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('booking_dates').select('*', { count: 'exact', head: true }).eq('status', 'confirmed')
    ]);

    return res.status(200).json({
      success: true,
      data: {
        totalProperties: totalProperties || 0,
        bookedProperties: (totalProperties || 0) - (availableProperties || 0),
        activeBookings: activeBookingsCount || 0,
        pendingBookings: pendingBookingDates || 0,
        completeBookings: confirmedBookingDates || 0,
      }
    });

  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return res.status(500).json({
      error: 'Failed to fetch dashboard statistics',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;



