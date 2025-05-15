const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Device = require('../models/Device');
const crypto = require('crypto');

// JWT configuration
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

// Auth-check middleware for protected routes
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

// Disable password-only login
router.post('/login', (req, res) => {
  return res
    .status(405)
    .json({ message: 'Password-only login disabled. Use Passkey login instead.' });
});

// Sign-up: Create user with Argon2id-hashed password & return JWT
router.post('/signup', async (req, res) => {
  const { fullName, email, password, twoFactorEnabled } = req.body;
  if (!fullName || !email || !password) {
    return res.status(400).json({ message: 'fullName, email, and password are required' });
  }
  try {
    if (await User.exists({ email })) {
      return res.status(409).json({ message: 'Email already registered' });
    }
    const user = new User({ fullName, email, twoFactorEnabled: !!twoFactorEnabled });
    await user.setPassword(password);  // uses Argon2id under the hood
    await user.save();
    const token = signToken({ userId: user._id });
    return res.json({
      user: { id: user._id, fullName: user.fullName, email: user.email, twoFactorEnabled: user.twoFactorEnabled },
      token
    });
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Verify Signature — primary login via passkey, with optional 2FA
router.post('/verify-signature', async (req, res) => {
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

module.exports = router; 