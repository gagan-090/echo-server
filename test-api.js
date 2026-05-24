/**
 * Echo API Test Script
 * Tests all endpoints after migration.
 * Usage: node test-api.js
 */
import 'dotenv/config';

const BASE = 'http://localhost:4000/api';
let accessToken = null;
let testUserId = null;
let testConvId = null;

async function req(method, path, body = null, auth = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json();
  return { status: res.status, data };
}

function log(label, result) {
  const icon = result.status >= 200 && result.status < 300 ? '✅' : '❌';
  console.log(`${icon} ${label} [${result.status}]`, JSON.stringify(result.data).slice(0, 120));
}

async function run() {
  console.log('🧪 Echo API Test Suite\n');
  console.log('='.repeat(60));

  // 1. Health Check
  const health = await req('GET', '/health', null, false);
  log('GET /health', health);

  // 2. Register User A
  const regA = await req('POST', '/auth/register', {
    email: `testA_${Date.now()}@echo.test`,
    password: 'TestPass123!',
    display_name: 'Alice Tester',
  }, false);
  log('POST /auth/register (User A)', regA);

  if (regA.status === 201) {
    accessToken = regA.data.data.accessToken;
    testUserId = regA.data.data.user.id;
  }

  // 3. Register User B
  const emailB = `testB_${Date.now()}@echo.test`;
  const regB = await req('POST', '/auth/register', {
    email: emailB,
    password: 'TestPass456!',
    display_name: 'Bob Tester',
  }, false);
  log('POST /auth/register (User B)', regB);

  let userBId = null;
  let tokenB = null;
  if (regB.status === 201) {
    userBId = regB.data.data.user.id;
    tokenB = regB.data.data.accessToken;
  }

  // 4. Get Me
  const me = await req('GET', '/users/me');
  log('GET /users/me', me);

  // 5. Update Profile
  const update = await req('PATCH', '/users/me', {
    display_name: 'Alice Updated',
    bio: 'Testing Echo chat app',
  });
  log('PATCH /users/me', update);

  // 6. Search Users
  const search = await req('GET', '/users/search?q=Bob');
  log('GET /users/search?q=Bob', search);

  // 7. Create Conversation
  if (userBId) {
    const conv = await req('POST', '/conversations', { userId: userBId });
    log('POST /conversations', conv);
    testConvId = conv.data?.data?.id;
  }

  // 8. List Conversations
  const convList = await req('GET', '/conversations');
  log('GET /conversations', convList);

  // 9. Send Message
  if (testConvId) {
    const msg = await req('POST', `/conversations/${testConvId}/messages`, {
      content: 'Hello Bob! This is a test message from Alice.',
      type: 'text',
    });
    log('POST /conversations/:id/messages', msg);

    // 10. Get Messages
    const msgs = await req('GET', `/conversations/${testConvId}/messages`);
    log('GET /conversations/:id/messages', msgs);

    // 11. Mark Read (as User B)
    if (tokenB) {
      const origToken = accessToken;
      accessToken = tokenB;
      const read = await req('PATCH', `/conversations/${testConvId}/messages/read`);
      log('PATCH /conversations/:id/messages/read (User B)', read);
      accessToken = origToken;
    }

    // 12. Get Conversation Key
    const key = await req('GET', `/conversations/${testConvId}/key`);
    log('GET /conversations/:id/key', key);
  }

  // 13. Login
  const login = await req('POST', '/auth/login', {
    email: regA.data?.data?.user?.email,
    password: 'TestPass123!',
  }, false);
  log('POST /auth/login', login);

  // 14. Update Presence
  if (login.status === 200) {
    accessToken = login.data.data.accessToken;
    const presence = await req('PATCH', '/users/me/presence');
    log('PATCH /users/me/presence', presence);
  }

  // 15. 404 Route
  const notFound = await req('GET', '/nonexistent', null, false);
  log('GET /nonexistent (404 test)', notFound);

  console.log('\n' + '='.repeat(60));
  console.log('🏁 Test suite complete');
}

run().catch(err => console.error('Fatal:', err));
