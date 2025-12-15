import { beforeAll, afterAll } from 'vitest';
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Mock external services for testing
beforeAll(async () => {
  // Mock Stripe
  process.env.STRIPE_SECRET_KEY = 'sk_test_mock_key';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_mock_secret';
  
  // Mock Supabase
  process.env.SUPABASE_URL = 'https://mock.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock_service_role_key';
  
  // Mock webhook URL
  process.env.GHL_WEBHOOK_URL = 'https://mock.webhook.url';
});

afterAll(async () => {
  // Cleanup after tests
});
