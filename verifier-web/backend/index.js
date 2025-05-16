// backend/index.js
require('dotenv').config();
const express          = require('express');
const helmet           = require('helmet');
const rateLimit        = require('express-rate-limit');
const mongoSanitize    = require('express-mongo-sanitize');
const xss              = require('xss-clean');
const cors             = require('cors');
const connectDB        = require('./db');
const authRoutes       = require('./routes/auth');
const deviceRoutes     = require('./routes/device');

const app = express();

// --- GLOBAL MIDDLEWARES ---

// 1) Secure HTTP headers
app.use(helmet());

// 2) CORS (customize origin in production)
app.use(cors({ origin: true, credentials: true }));

// 3) Body parsing
app.use(express.json({ limit: '10kb' }));

// 4) Data sanitization against NoSQL injection
// app.use(mongoSanitize());

// 5) Basic XSS sanitization
// app.use(xss());

// --- RATE LIMITERS ---

// Prevent brute‐force on signup + verify endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,                  // limit each IP to 50 requests per window
  message: 'Too many attempts from this IP, please try again later'
});
app.use('/api/signup', authLimiter);
app.use('/api/verify-signature', authLimiter);

// --- DATABASE CONNECTION ---
connectDB();

// --- ROUTES ---
app.use('/api', authRoutes);
app.use('/api', deviceRoutes);

// --- START SERVER ---
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
});