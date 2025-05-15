const express = require('express');
const router = express.Router();
const Device = require('../models/Device');
const jwt = require('jsonwebtoken');

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET not set in .env');
  process.exit(1);
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

// Register Passkey (device) for the logged-in user
router.post('/register-device', requireAuth, async (req, res) => {
  const userId = req.userId;
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

// Get user's registered devices
router.get('/devices', requireAuth, async (req, res) => {
  try {
    const devices = await Device.find({ userId: req.userId });
    return res.json({ devices });
  } catch (err) {
    console.error('Get devices error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Delete a device
router.delete('/devices/:deviceId', requireAuth, async (req, res) => {
  try {
    const device = await Device.findOneAndDelete({
      _id: req.params.deviceId,
      userId: req.userId
    });
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('Delete device error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 