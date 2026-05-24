import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';
import { env } from '../config/env.js';

let privateKey, publicKey;

try {
  privateKey = process.env.JWT_PRIVATE_KEY || fs.readFileSync(env.JWT_PRIVATE_KEY_PATH, 'utf8');
  publicKey = process.env.JWT_PUBLIC_KEY || fs.readFileSync(env.JWT_PUBLIC_KEY_PATH, 'utf8');
} catch {
  // Fallback to HMAC if RSA keys don't exist (dev convenience)
  privateKey = env.COOKIE_SECRET;
  publicKey = env.COOKIE_SECRET;
}

const isRSA = privateKey.includes('-----BEGIN');

export function generateAccessToken(payload) {
  return jwt.sign(payload, privateKey, {
    algorithm: isRSA ? 'RS256' : 'HS256',
    expiresIn: env.JWT_ACCESS_EXPIRY,
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, publicKey, {
    algorithms: [isRSA ? 'RS256' : 'HS256'],
  });
}

export function generateRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
