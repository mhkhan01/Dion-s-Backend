import express from 'express';
import { supabaseAdmin } from '../lib/supabase';

const router = express.Router();

// GET /api/admin-users - Get all admin users (bypasses RLS)
router.get('/', async (req, res) => {
  try {
    console.log('Fetching admin users via backend...');

    const { data, error } = await supabaseAdmin
      .from('admin')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching admin users:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch admin users',
        details: error.message
      });
    }

    console.log(`Successfully fetched ${data?.length || 0} admin users`);

    return res.status(200).json({
      success: true,
      users: data || []
    });
  } catch (error) {
    console.error('Error fetching admin users:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch admin users',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// PUT /api/admin-users/activate - Activate a user (bypasses RLS)
router.put('/activate', async (req, res) => {
  try {
    const { userId, tableName } = req.body;

    if (!userId || !tableName) {
      return res.status(400).json({
        success: false,
        error: 'userId and tableName are required'
      });
    }

    console.log('Activating user:', { userId, tableName });

    const { error } = await supabaseAdmin
      .from(tableName)
      .update({ is_active: true })
      .eq('id', userId);

    if (error) {
      console.error('Error activating user:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to activate user',
        details: error.message
      });
    }

    console.log('User activated successfully');

    return res.status(200).json({
      success: true,
      message: 'User activated successfully'
    });
  } catch (error) {
    console.error('Error activating user:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to activate user',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// PUT /api/admin-users/deactivate - Deactivate a user (bypasses RLS)
router.put('/deactivate', async (req, res) => {
  try {
    const { userId, tableName } = req.body;

    if (!userId || !tableName) {
      return res.status(400).json({
        success: false,
        error: 'userId and tableName are required'
      });
    }

    console.log('Deactivating user:', { userId, tableName });

    const { error } = await supabaseAdmin
      .from(tableName)
      .update({ is_active: false })
      .eq('id', userId);

    if (error) {
      console.error('Error deactivating user:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to deactivate user',
        details: error.message
      });
    }

    console.log('User deactivated successfully');

    return res.status(200).json({
      success: true,
      message: 'User deactivated successfully'
    });
  } catch (error) {
    console.error('Error deactivating user:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to deactivate user',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// DELETE /api/admin-users/:tableName/:userId - Delete a user (bypasses RLS)
router.delete('/:tableName/:userId', async (req, res) => {
  try {
    const { userId, tableName } = req.params;

    if (!userId || !tableName) {
      return res.status(400).json({
        success: false,
        error: 'userId and tableName are required'
      });
    }

    console.log('Deleting user:', { userId, tableName });

    const { error } = await supabaseAdmin
      .from(tableName)
      .delete()
      .eq('id', userId);

    if (error) {
      console.error('Error deleting user:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to delete user',
        details: error.message
      });
    }

    console.log('User deleted successfully');

    return res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete user',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;









