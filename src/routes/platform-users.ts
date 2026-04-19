import express from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { authenticateUser, AuthenticatedRequest } from '../middleware/auth';

const router = express.Router();

// GET /api/platform-users - Get all contractors and landlords (requires auth)
router.get('/', authenticateUser, async (req: AuthenticatedRequest, res) => {
  try {
    console.log('Fetching platform users via backend...');

    // Fetch contractors using service role (bypasses RLS)
    const { data: contractors, error: contractorError } = await supabaseAdmin
      .from('contractor')
      .select('*')
      .order('created_at', { ascending: false });

    if (contractorError) {
      console.error('Error fetching contractors:', contractorError);
    }

    // Fetch landlords using service role (bypasses RLS)
    const { data: landlords, error: landlordError } = await supabaseAdmin
      .from('landlord')
      .select('*')
      .order('created_at', { ascending: false });

    if (landlordError) {
      console.error('Error fetching landlords:', landlordError);
    }

    // Combine contractors and landlords
    const allUsers = [
      ...(contractors || []).map(user => ({ ...user, userType: 'Contractor', tableName: 'contractor' })),
      ...(landlords || []).map(user => ({ ...user, userType: 'Landlord', tableName: 'landlord' }))
    ];

    // Batch-fetch all auth users once to avoid N+1 getUserById calls
    const authUserMap = new Map<string, boolean>();
    let authPage = 1;
    let hasMoreAuthUsers = true;
    while (hasMoreAuthUsers) {
      const { data: { users: pageUsers }, error: listError } = await supabaseAdmin.auth.admin.listUsers({
        page: authPage,
        perPage: 1000
      });
      if (listError || !pageUsers || pageUsers.length === 0) break;
      for (const authUser of pageUsers) {
        authUserMap.set(authUser.id, authUser.email_confirmed_at != null);
      }
      hasMoreAuthUsers = pageUsers.length === 1000;
      authPage++;
    }

    const enrichedUsers = allUsers.map(user => ({
      ...user,
      email_verified: authUserMap.get(user.id) ?? false
    }));

    console.log(`Successfully fetched ${contractors?.length || 0} contractors and ${landlords?.length || 0} landlords`);

    return res.status(200).json({
      success: true,
      users: enrichedUsers,
      counts: {
        contractors: contractors?.length || 0,
        landlords: landlords?.length || 0,
        total: allUsers.length
      }
    });
  } catch (error) {
    console.error('Error fetching platform users:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to fetch platform users',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;










