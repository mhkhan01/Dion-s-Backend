import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import bookingRoutes from './routes/bookings';
import stripeRoutes from './routes/stripe';
import integrationRoutes from './routes/integrations';
import adminRoutes from './routes/admin';
import bookingRequestRoutes from './routes/booking-requests';
import partnerSignupRoutes from './routes/partner-signup';
import adminSignupRoutes from './routes/admin-signup';
import clientSignupRoutes from './routes/client-signup';
import propertyAssignmentRoutes from './routes/property-assignment';
import propertiesRoutes from './routes/properties';
import contactRoutes from './routes/contact';
import bookingValuesRoutes from './routes/booking-values';
import platformUsersRoutes from './routes/platform-users';
import adminUsersRoutes from './routes/admin-users';
import adminBookingsRoutes from './routes/admin-bookings';
import adminBookedPropertiesRoutes from './routes/admin-booked-properties';
import adminLoginCheckRoutes from './routes/admin-login-check';
import clientLoginCheckRoutes from './routes/client-login-check';
import partnerLoginCheckRoutes from './routes/partner-login-check';

// Load environment variables
dotenv.config();
//const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;
app.use(cors({
  origin: '*',
  credentials: true
}));
// Trust proxy - MUST be set before rate limiter
// This is required when behind AWS Load Balancer/Nginx
app.set('trust proxy', true);
//checking push
// Security middleware
app.use(helmet());
// Dynamic CORS configuration to support multiple environments
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:3000',
  process.env.ADMIN_FRONTEND_URL || 'http://localhost:3002',
  'https://admin.booking-hub.co.uk',
  'https://app.booking-hub.co.uk',
  'https://booking-hub.co.uk',
  'http://localhost:3000',
  'http://localhost:3002'
];

// Add Amplify CloudFront URLs if provided
if (process.env.AMPLIFY_FRONTEND_URL) {
  allowedOrigins.push(process.env.AMPLIFY_FRONTEND_URL);
}
if (process.env.AMPLIFY_ADMIN_URL) {
  allowedOrigins.push(process.env.AMPLIFY_ADMIN_URL);
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else if (origin.includes('.cloudfront.net') || origin.includes('.amplifyapp.com')) {
      // Allow all Amplify/CloudFront domains in production
      callback(null, true);
    } else {
      console.log('Blocked CORS request from origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression
app.use(compression());

// Logging
app.use(morgan('combined'));

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({ 
    message: 'Property Booking Backend API',
    status: 'running',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      api: {
        bookings: '/api/bookings',
        stripe: '/api/stripe',
        integrations: '/api/integrations',
        admin: '/api/admin',
        bookingRequests: '/api/booking-requests',
        partnerSignup: '/api/partner-signup',
        adminSignup: '/api/admin-signup',
        clientSignup: '/api/client-signup',
        propertyAssignment: '/api/property-assignment',
        properties: '/api/properties',
        contact: '/api/contact',
        bookingValues: '/api/booking-values',
        platformUsers: '/api/platform-users',
        adminUsers: '/api/admin-users',
        adminBookings: '/api/admin-bookings',
        adminBookedProperties: '/api/admin-booked-properties',
        adminLoginCheck: '/api/admin-login-check',
        clientLoginCheck: '/api/client-login-check',
        partnerLoginCheck: '/api/partner-login-check'
      }
    }
  });
});

// Health check endpoint
app.use('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'property-booking-backend'
  });
});

// API routes
app.use('/api/bookings', bookingRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/booking-requests', bookingRequestRoutes);
app.use('/api/partner-signup', partnerSignupRoutes);
app.use('/api/admin-signup', adminSignupRoutes);
app.use('/api/client-signup', clientSignupRoutes);
app.use('/api/property-assignment', propertyAssignmentRoutes);
app.use('/api/properties', propertiesRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/booking-values', bookingValuesRoutes);
app.use('/api/platform-users', platformUsersRoutes);
app.use('/api/admin-users', adminUsersRoutes);
app.use('/api/admin-bookings', adminBookingsRoutes);
app.use('/api/admin-booked-properties', adminBookedPropertiesRoutes);
app.use('/api/admin-login-check', adminLoginCheckRoutes);
app.use('/api/client-login-check', clientLoginCheckRoutes);
app.use('/api/partner-login-check', partnerLoginCheckRoutes);

// Error handling middleware (must be last)
app.use(notFound);
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});


export default app;