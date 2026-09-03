/**
 * Throwaway integration check for the Google sign-in controller.
 * Stubs ONLY Google's signature verification; everything else (routing,
 * user upsert, admin promotion, JWT issuing, RBAC) is the real code path.
 *
 * Run: npm run test:auth
 */
import { mock } from 'node:test';
import assert from 'node:assert/strict';

/*
 * Roles are granted only through the admin interface — there is no environment
 * variable and no promotion at sign-in. So the admin account used below is
 * created as a plain member and then promoted directly in the database, which
 * is exactly the documented bootstrap for a fresh deployment.
 */
const ADMIN_EMAIL = 'fitgen-admin-test@example.com';
const USER_EMAIL = 'fitgen-user-test@example.com';

let googleUser = null;

await mock.module('../src/services/googleAuth.js', {
  namedExports: {
    verifyGoogleIdToken: async () => googleUser,
  },
});

const { connectDB, disconnectDB } = await import('../src/config/db.js');
const buildApp = (await import('../src/app.js')).default;
const { User } = await import('../src/models/User.js');

await connectDB();
await User.deleteMany({ email: { $in: [USER_EMAIL, ADMIN_EMAIL] } });

const app = buildApp();
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

const post = async (path, body, token) => {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, body: await res.json() };
};

const get = async (path, token) => {
  const res = await fetch(base + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return { status: res.status, body: await res.json() };
};

const results = [];
const check = (name, fn) => {
  try {
    fn();
    results.push(`  PASS  ${name}`);
  } catch (err) {
    results.push(`  FAIL  ${name}\n        ${err.message}`);
    process.exitCode = 1;
  }
};

/* --- 1. First sign-in creates the account -------------------------------- */
googleUser = {
  googleId: 'google-newbie-1',
  email: USER_EMAIL,
  name: 'New Lifter',
  avatarUrl: 'https://example.com/a.jpg',
};
const signup = await post('/api/auth/google', { credential: 'stub' });

check('new account → 201 Created', () => assert.equal(signup.status, 201));
check('new account → isNewUser true', () => assert.equal(signup.body.isNewUser, true));
check('new account → role defaults to user', () =>
  assert.equal(signup.body.user.role, 'user'));
check('new account → onboarding pending', () =>
  assert.equal(signup.body.user.onboardingCompleted, false));
check('new account → JWT issued', () =>
  assert.match(signup.body.token, /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/));
check('new account → email verified via Google', () =>
  assert.equal(signup.body.user.emailVerified, true));

/* --- 2. Second sign-in reuses the account ------------------------------- */
googleUser = { ...googleUser, name: 'Renamed Lifter' };
const signin = await post('/api/auth/google', { credential: 'stub' });

check('returning account → 200 OK', () => assert.equal(signin.status, 200));
check('returning account → isNewUser false', () =>
  assert.equal(signin.body.isNewUser, false));
check('returning account → same user id', () =>
  assert.equal(signin.body.user.id, signup.body.user.id));
check('returning account → Google profile refreshed', () =>
  assert.equal(signin.body.user.name, 'Renamed Lifter'));

const userCount = await User.countDocuments({ email: USER_EMAIL });
check('returning account → exactly one document', () => assert.equal(userCount, 1));

/* --- 3. Token works, and gates admin routes ----------------------------- */
const me = await get('/api/auth/me', signin.body.token);
check('issued token authenticates /auth/me', () => assert.equal(me.status, 200));
check('/auth/me never leaks googleId', () =>
  assert.equal(me.body.user.googleId, undefined));

const denied = await get('/api/admin/stats', signin.body.token);
check('user role blocked from /admin/stats (403)', () =>
  assert.equal(denied.status, 403));

/* --- 4. roles come from the database, never from sign-in ---------------- */
googleUser = {
  googleId: 'google-admin-1',
  email: ADMIN_EMAIL,
  name: 'Project Owner',
};
const created = await post('/api/auth/google', { credential: 'stub' });
check('a new account is always a plain member', () =>
  assert.equal(created.body.user.role, 'user'));

// The documented bootstrap: promote the first administrator in the database.
await User.updateOne({ email: ADMIN_EMAIL }, { $set: { role: 'admin' } });
const admin = await post('/api/auth/google', { credential: 'stub' });
check('a database-granted role is reflected on the next sign-in', () =>
  assert.equal(admin.body.user.role, 'admin'));

const allowed = await get('/api/admin/stats', admin.body.token);
check('admin role reaches /admin/stats (200)', () =>
  assert.equal(allowed.status, 200));
check('admin stats are aggregate-only (no user list)', () =>
  assert.equal(allowed.body.data.users.list, undefined));

/* --- 5. Tampered token rejected ----------------------------------------- */
const tampered = `${signin.body.token.slice(0, -4)}AAAA`;
const bad = await get('/api/auth/me', tampered);
check('tampered signature rejected (401)', () => assert.equal(bad.status, 401));

const none = await get('/api/auth/me');
check('missing token rejected (401)', () => assert.equal(none.status, 401));

console.log('\n' + results.join('\n'));
console.log(
  `\n${results.filter((r) => r.includes('PASS')).length} passed, ${
    results.filter((r) => r.includes('FAIL')).length
  } failed\n`,
);

await User.deleteMany({ email: { $in: [USER_EMAIL, ADMIN_EMAIL] } });
server.close();
await disconnectDB();
