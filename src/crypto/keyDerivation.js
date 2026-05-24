import crypto from 'crypto';
import { env } from '../config/env.js';

const keyCache = new Map();

export function deriveConversationKey(conversationId) {
  if (keyCache.has(conversationId)) return keyCache.get(conversationId);
  const salt = crypto.createHash('sha256').update(conversationId).digest();
  const masterKey = Buffer.from(env.MASTER_ENCRYPTION_KEY, 'hex');
  const key = crypto.pbkdf2Sync(masterKey, salt, 100_000, 32, 'sha256');
  keyCache.set(conversationId, key);
  return key;
}
