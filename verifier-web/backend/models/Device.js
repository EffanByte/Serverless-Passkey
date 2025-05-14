// backend/models/Device.js
const { Schema, model } = require('mongoose');

const deviceSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    unique: true,
    required: true
  },
  publicKey: {
    type: String,    // base64 SPKI
    unique: true,
    required: true
  },
  deviceName: {
    type: String,    // e.g. "iPhone 14 Pro"
    trim: true,
    default: ''      // optional, could be empty
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = model('Device', deviceSchema);
