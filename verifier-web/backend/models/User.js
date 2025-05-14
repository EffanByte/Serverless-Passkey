// backend/models/User.js
const { Schema, model } = require('mongoose');
const argon2 = require('argon2');

const userSchema = new Schema({
  fullName:    { type: String, required: true, trim: true },
  email:       { type: String, required: true, lowercase: true, unique: true },
  passwordHash:{ type: String, required: true },
  twoFactorEnabled: { type: Boolean, default: false },
  createdAt:   { type: Date, default: Date.now }
});

// Replace bcrypt.setPassword with Argon2id
userSchema.methods.setPassword = async function(password) {
  this.passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,    // 64 MB
    timeCost:    4,         // 4 iterations
    parallelism: 1,         // single-threaded
    hashLength:  64         // 512-bit output → ~256-bit PQ security
  });
};

// Replace bcrypt.verifyPassword with Argon2 verify
userSchema.methods.verifyPassword = function(password) {
  return argon2.verify(this.passwordHash, password);
};

module.exports = model('User', userSchema);
