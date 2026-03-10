import express from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { getUserIdFromBearerToken } from '../lib/verifySupabaseToken';

const router = express.Router();

// GET /api/partner-booked-properties - Get booked properties for the logged-in partner (landlord_id).
// Authorization: valid Bearer JWT required; user must exist in landlord table and be active.
router.get('/', async (req, res) => {
  try {
    const landlordId = await getUserIdFromBearerToken(req);
    if (!landlordId) {
      return res.status(401).json({
        success: false,
        error: 'Missing or invalid authorization header',
        bookedProperties: []
      });
    }

    // Ensure the user is an active landlord (exists in landlord table and is_active is not false)
    const { data: landlord, error: landlordError } = await supabaseAdmin
      .from('landlord')
      .select('id, is_active')
      .eq('id', landlordId)
      .maybeSingle();

    if (landlordError || !landlord) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        bookedProperties: []
      });
    }

    if (landlord.is_active === false) {
      return res.status(403).json({
        success: false,
        error: 'Account is inactive',
        bookedProperties: []
      });
    }

    const selectQuery = `
      *,
      properties:property_id (
        id,
        property_name,
        house_address,
        locality,
        city,
        county,
        country,
        postcode,
        property_type,
        bedrooms,
        beds,
        bathrooms
      ),
      contractor:contractor_id (
        id,
        full_name,
        email,
        phone
      ),
      booking_requests:booking_request_id (
        id,
        full_name,
        company_name,
        email,
        phone,
        city
      )
    `;

    // Fetch by landlord_id (primary)
    const { data: byLandlordId, error: err1 } = await supabaseAdmin
      .from('booked_properties')
      .select(selectQuery)
      .eq('landlord_id', landlordId)
      .order('created_at', { ascending: false });

    if (err1) {
      console.error('Error fetching partner booked properties by landlord_id:', err1);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch booked properties',
        bookedProperties: []
      });
    }

    const combined: Record<string, unknown>[] = [...(byLandlordId || [])];
    const seenIds = new Set(combined.map((b: Record<string, unknown>) => b.id as string));

    // Also include booked_properties where the property is owned by this landlord (in case landlord_id was null on insert)
    const { data: partnerPropertyIds } = await supabaseAdmin
      .from('properties')
      .select('id')
      .eq('landlord_id', landlordId);

    const propertyIds = (partnerPropertyIds || []).map((p: { id: string }) => p.id);

    if (propertyIds.length > 0) {
      const { data: byPropertyOwnership, error: err2 } = await supabaseAdmin
        .from('booked_properties')
        .select(selectQuery)
        .in('property_id', propertyIds)
        .order('created_at', { ascending: false });

      if (!err2 && byPropertyOwnership) {
        for (const row of byPropertyOwnership as Record<string, unknown>[]) {
          if (!seenIds.has(row.id as string)) {
            seenIds.add(row.id as string);
            combined.push(row);
          }
        }
        combined.sort((a, b) => {
          const ta = (a.created_at as string) ? new Date(a.created_at as string).getTime() : 0;
          const tb = (b.created_at as string) ? new Date(b.created_at as string).getTime() : 0;
          return tb - ta;
        });
      }
    }

    return res.status(200)
      .set('Cache-Control', 'no-store, no-cache, must-revalidate')
      .set('Pragma', 'no-cache')
      .json({
        success: true,
        bookedProperties: combined
      });
  } catch (error) {
    console.error('Error fetching partner booked properties:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch booked properties',
      bookedProperties: []
    });
  }
});

export default router;
