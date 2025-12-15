import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import bookingRoutes from '../bookings';

// Mock dependencies
vi.mock('../../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => ({
            data: {
              id: 'booking-1',
              property_id: 'property-1',
              contractor_id: 'contractor-1',
              start_date: '2024-01-15',
              end_date: '2024-01-20',
              status: 'pending',
              property: {
                title: 'Test Property',
                address: '123 Test St',
                price: 100,
              },
              contractor: {
                full_name: 'John Contractor',
              },
            },
            error: null,
          })),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => ({
            data: {
              id: 'booking-2',
              property_id: 'property-1',
              contractor_id: 'contractor-1',
              start_date: '2024-01-15',
              end_date: '2024-01-20',
              status: 'pending',
            },
            error: null,
          })),
        })),
      })),
    })),
  },
}));

vi.mock('../../lib/webhooks', () => ({
  sendWebhookEvent: vi.fn(),
}));

vi.mock('../../middleware/auth', () => ({
  authenticateUser: (req: any, res: any, next: any) => {
    req.user = {
      id: 'contractor-1',
      role: 'contractor',
      full_name: 'John Contractor',
    };
    next();
  },
  requireContractor: (req: any, res: any, next: any) => {
    next();
  },
}));

const app = express();
app.use(express.json());
app.use('/api/bookings', bookingRoutes);

describe('Bookings API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/bookings/:id', () => {
    it('should return booking details', async () => {
      const response = await request(app)
        .get('/api/bookings/booking-1')
        .expect(200);

      expect(response.body).toHaveProperty('booking');
      expect(response.body.booking).toHaveProperty('id', 'booking-1');
    });
  });

  describe('POST /api/bookings/create', () => {
    it('should create a new booking', async () => {
      const bookingData = {
        property_id: 'property-1',
        start_date: '2024-01-15',
        end_date: '2024-01-20',
      };

      const response = await request(app)
        .post('/api/bookings/create')
        .send(bookingData)
        .expect(201);

      expect(response.body).toHaveProperty('booking');
      expect(response.body.booking).toHaveProperty('id', 'booking-2');
    });

    it('should validate booking data', async () => {
      const invalidData = {
        property_id: 'invalid-uuid',
        start_date: '2024-01-20',
        end_date: '2024-01-15', // End date before start date
      };

      const response = await request(app)
        .post('/api/bookings/create')
        .send(invalidData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });
});
