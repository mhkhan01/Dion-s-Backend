import "dotenv/config";

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

// Admin client with service role key for server-side operations
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Regular client for user operations
export const supabase = createClient(supabaseUrl, supabaseServiceKey);

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          role: 'contractor' | 'landlord' | 'admin';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          role: 'contractor' | 'landlord' | 'admin';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          role?: 'contractor' | 'landlord' | 'admin';
          created_at?: string;
          updated_at?: string;
        };
      };
      properties: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          description: string | null;
          address: string;
          lat: number | null;
          lng: number | null;
          price: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          title: string;
          description?: string | null;
          address: string;
          lat?: number | null;
          lng?: number | null;
          price: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          title?: string;
          description?: string | null;
          address?: string;
          lat?: number | null;
          lng?: number | null;
          price?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      bookings: {
        Row: {
          id: string;
          property_id: string;
          contractor_id: string;
          start_date: string;
          end_date: string;
          status: 'pending' | 'confirmed' | 'cancelled' | 'paid';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          contractor_id: string;
          start_date: string;
          end_date: string;
          status?: 'pending' | 'confirmed' | 'cancelled' | 'paid';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          property_id?: string;
          contractor_id?: string;
          start_date?: string;
          end_date?: string;
          status?: 'pending' | 'confirmed' | 'cancelled' | 'paid';
          created_at?: string;
          updated_at?: string;
        };
      };
      invoices: {
        Row: {
          id: string;
          booking_id: string;
          stripe_session_id: string | null;
          stripe_payment_url: string | null;
          amount: number;
          status: 'unpaid' | 'paid';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          stripe_session_id?: string | null;
          stripe_payment_url?: string | null;
          amount: number;
          status?: 'unpaid' | 'paid';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          booking_id?: string;
          stripe_session_id?: string | null;
          stripe_payment_url?: string | null;
          amount?: number;
          status?: 'unpaid' | 'paid';
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
};
