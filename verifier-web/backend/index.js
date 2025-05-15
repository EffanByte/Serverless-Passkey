// backend/index.js
require('dotenv').config();
const express          = require('express');
const helmet           = require('helmet');
const rateLimit        = require('express-rate-limit');
const mongoSanitize    = require('express-mongo-sanitize');
const xss              = require('xss-clean');
const cors             = require('cors');
const connectDB        = require('./db');
const User             = require('./models/User');
const Device           = require('./models/Device');
const crypto           = require('crypto');
const jwt              = require('jsonwebtoken');

const app = express();

// --- GLOBAL MIDDLEWARES ---

// 1) Secure HTTP headers
app.use(helmet());

// 2) CORS (customize origin in production)
app.use(cors({ origin: true, credentials: true }));

// 3) Body parsing
app.use(express.json({ limit: '10kb' }));

// 4) Data sanitization against NoSQL injection
app.use(mongoSanitize());

// 5) Basic XSS sanitization
app.use(xss());

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

// --- JWT HELPERS ---

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET not set in .env');
  process.exit(1);
}

// 1h expiry, HS512 for PQ-safe symmetric security
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS512',
    expiresIn: '1h'
  });
}

// --- ROUTES ---

// Disable password‐only login
app.post('/api/login', (req, res) => {
  return res
    .status(405)
    .json({ message: 'Password-only login disabled. Use Passkey login instead.' });
});

// 1) Sign-up: Create user with Argon2id‐hashed password & return JWT
app.post('/api/signup', async (req, res) => {
  const { fullName, email, password } = req.body;
  if (!fullName || !email || !password) {
    return res.status(400).json({ message: 'fullName, email, and password are required' });
  }
  try {
    if (await User.exists({ email })) {
      return res.status(409).json({ message: 'Email already registered' });
    }
    const user = new User({ fullName, email });
    await user.setPassword(password);  // uses Argon2id under the hood
    await user.save();
    const token = signToken({ userId: user._id });
    return res.json({
      user: { id: user._id, fullName: user.fullName, email: user.email },
      token
    });
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Auth‐check middleware for protected routes
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid authorization header' });
  }
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS512'] });
    req.userId = payload.userId;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

// 2) Register Passkey (device) for the logged‐in user
app.post('/api/register-device', requireAuth, async (req, res) => {
  const userId           = req.userId;
  const { publicKey, deviceName = '' } = req.body;
  if (!publicKey) {
    return res.status(400).json({ message: 'publicKey is required' });
  }
  try {
    const conflict = await Device.findOne({ publicKey });
    if (conflict && conflict.userId.toString() !== userId) {
      return res.status(409).json({ message: 'This passkey is already in use' });
    }
    await Device.findOneAndUpdate(
      { userId },
      { publicKey, userId, deviceName },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('Register-device error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// 3) Verify Signature — primary login via passkey, with optional 2FA
app.post('/api/verify-signature', async (req, res) => {
  const { email, challenge, signature, password } = req.body;
  if (!email || !challenge || !signature) {
    return res.status(400).json({ message: 'email, challenge, and signature are required' });
  }

  try {
    // a) Fetch user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'No account found for that email' });
    }

    // b) If 2FA is enabled, verify the password first
    if (user.twoFactorEnabled) {
      if (!password) {
        return res.status(400).json({ message: 'Password required for two-factor login' });
      }
      const pwdOk = await user.verifyPassword(password);
      if (!pwdOk) {
        return res.status(401).json({ message: 'Invalid password' });
      }
    }

    // c) Fetch device
    const device = await Device.findOne({ userId: user._id });
    if (!device) {
      return res.status(404).json({ message: 'No passkey registered for this user' });
    }

    // d) Decode base64 → Uint8Array
    const toBuf = b64 => Uint8Array.from(Buffer.from(b64, 'base64'));
    const chalBuf = toBuf(challenge);
    const sigBuf  = toBuf(signature);
    const keyBuf  = toBuf(device.publicKey);

    // e) Import SPKI public key
    const key = await crypto.webcrypto.subtle.importKey(
      'spki', keyBuf.buffer,
      { name:'ECDSA', namedCurve:'P-256' },
      false,
      ['verify']
    );

    // f) Verify the signature over the raw challenge
    const valid = await crypto.webcrypto.subtle.verify(
      { name:'ECDSA', hash:'SHA-256' },
      key, sigBuf, chalBuf
    );
    if (!valid) {
      return res.status(401).json({ message: 'Passkey signature invalid' });
    }

    // g) Success → issue JWT (HS512)
    const token = signToken({ userId: user._id });
    return res.json({
      success: true,
      user: { id: user._id, fullName: user.fullName, email: user.email },
      token
    });
  } catch (err) {
    console.error('Verify-signature error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// --- START SERVER ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
});