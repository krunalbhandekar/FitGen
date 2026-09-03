/**
 * Security tests for admin-managed roles.
 *
 * This endpoint grants privilege, so the negative cases matter more than the
 * happy path: a non-admin must not reach it, nobody may change their own role,
 * an administrator must always remain, and a role must never change on its own
 * at sign-in.
 *
 *   npm run test:adminusers
 */
import { mock } from 'node:test';
import assert from 'node:assert/strict';

const ADMIN_EMAIL = 'fitgen-roleadmin@example.com';
const SECOND_ADMIN = 'fitgen-role2nd@example.com';
const MEMBER_EMAIL = 'fitgen-rolemember@example.com';
const BOOTSTRAP_EMAIL = 'fitgen-bootstrap@example.com';

/*
 * There is no environment variable for roles any more: every account signs up
 * as a member, sign-in never changes a role, and the only ways in are the admin
 * interface or a direct database write (the documented bootstrap).
 */
let googleUser = null;
await mock.module('../src/services/googleAuth.js', {
  namedExports: { verifyGoogleIdToken: async () => googleUser },
});

const { connectDB, disconnectDB } = await import('../src/config/db.js');
const buildApp = (await import('../src/app.js')).default;
const { User } = await import('../src/models/User.js');

await connectDB();

const EMAILS = [ADMIN_EMAIL, SECOND_ADMIN, MEMBER_EMAIL, BOOTSTRAP_EMAIL];
const cleanup = () => User.deleteMany({ email: { $in: EMAILS } });

/**
 * Counts admins among THIS SUITE's accounts only.
 *
 * The database is shared with the developer's own account, which may itself be
 * an administrator — a global count would make these assertions depend on
 * whoever else exists.
 */
const testAdminCount = () =>
  User.countDocuments({ email: { $in: EMAILS }, role: 'admin' });
await cleanup();

const app = buildApp();
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

const req = async (method, path, { token, body } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json() };
};

const signIn = async (email, name) => {
  googleUser = { googleId: `g-${email}`, email, name };
  const res = await req('POST', '/api/auth/google', { body: { credential: 'stub' } });
  return { token: res.body.token, user: res.body.user };
};

const results = [];
const check = async (name, fn) => {
  try {
    await fn();
    results.push(`  PASS  ${name}`);
  } catch (err) {
    results.push(`  FAIL  ${name}\n        ${err.message}`);
    process.exitCode = 1;
  }
};

/* --- bootstrap: the database is the only way to make the FIRST admin ---- */
const firstSignIn = await signIn(ADMIN_EMAIL, 'Role Admin');
await check('bootstrap: every new account starts as a member', () =>
  assert.equal(firstSignIn.user.role, 'user'));

// The documented one-off step on a fresh database.
await User.updateOne({ email: ADMIN_EMAIL }, { $set: { role: 'admin' } });
const admin = await signIn(ADMIN_EMAIL, 'Role Admin');
await check('bootstrap: a database-granted role takes effect', () =>
  assert.equal(admin.user.role, 'admin'));

const member = await signIn(MEMBER_EMAIL, 'Ordinary Member');
await check('bootstrap: other accounts remain members', () =>
  assert.equal(member.user.role, 'user'));

/* --- RBAC: only admins may reach the endpoints ------------------------- */
const asMember = await req('GET', '/api/admin/users', { token: member.token });
await check('rbac: a plain user cannot list users (403)', () =>
  assert.equal(asMember.status, 403));

const escalate = await req('PATCH', `/api/admin/users/${member.user.id}/role`, {
  token: member.token,
  body: { role: 'admin' },
});
await check('rbac: a plain user cannot promote anyone (403)', () =>
  assert.equal(escalate.status, 403));

const anon = await req('GET', '/api/admin/users');
await check('rbac: unauthenticated access is rejected (401)', () =>
  assert.equal(anon.status, 401));

/* --- listing ---------------------------------------------------------- */
const list = await req('GET', '/api/admin/users', { token: admin.token });
await check('list: an admin sees the roster', () => {
  assert.equal(list.status, 200);
  assert.ok(list.body.data.length >= 2);
});

await check('privacy: the roster exposes NO profile, plan or log data', () => {
  const allowed = new Set([
    'id', 'email', 'name', 'avatarUrl', 'role', 'onboardingCompleted',
    'createdAt', 'lastLoginAt', 'roleManagedAt', 'isSelf',
  ]);
  for (const row of list.body.data) {
    const leaked = Object.keys(row).filter((k) => !allowed.has(k));
    assert.deepEqual(leaked, [], `leaked fields: ${leaked.join(', ')}`);
    assert.equal(row.profile, undefined);
    assert.equal(row.roleHistory, undefined);
  }
});

await check('list: the caller is marked so the UI can disable self-edit', () => {
  const me = list.body.data.find((u) => u.email === ADMIN_EMAIL);
  assert.equal(me.isSelf, true);
});

await check('list: the admin count is reported', () =>
  assert.ok(list.body.meta.adminCount >= 1));

await check('privacy: the roster no longer exposes any bootstrap config', () => {
  assert.equal(list.body.meta.bootstrapEmails, undefined);
  assert.ok(list.body.data.every((u) => u.bootstrapAdmin === undefined));
});

const searched = await req('GET', '/api/admin/users?search=rolemember', {
  token: admin.token,
});
await check('list: search filters by email', () => {
  assert.equal(searched.body.data.length, 1);
  assert.equal(searched.body.data[0].email, MEMBER_EMAIL);
});

const filtered = await req('GET', '/api/admin/users?role=admin', { token: admin.token });
await check('list: role filter works', () =>
  assert.ok(filtered.body.data.every((u) => u.role === 'admin')));

/* --- guard 1: never your own role ------------------------------------- */
const selfDemote = await req('PATCH', `/api/admin/users/${admin.user.id}/role`, {
  token: admin.token,
  body: { role: 'user' },
});
await check('guard: an admin cannot demote themselves (400)', () =>
  assert.equal(selfDemote.status, 400));
await check('guard: the self-edit refusal explains why', () =>
  assert.match(selfDemote.body.message, /your own role/i));

/* --- promotion -------------------------------------------------------- */
const promote = await req('PATCH', `/api/admin/users/${member.user.id}/role`, {
  token: admin.token,
  body: { role: 'admin' },
});
await check('promote: an admin can grant the role', () => {
  assert.equal(promote.status, 200);
  assert.equal(promote.body.data.role, 'admin');
  assert.equal(promote.body.data.changed, true);
});

await check('promote: the change is persisted and marked as managed', async () => {
  const fresh = await User.findById(member.user.id).lean();
  assert.equal(fresh.role, 'admin');
  assert.ok(fresh.roleManagedAt, 'roleManagedAt should be set');
  assert.equal(fresh.roleManagedBy.toString(), admin.user.id);
});

await check('promote: the audit trail records who did it', async () => {
  const fresh = await User.findById(member.user.id).lean();
  assert.equal(fresh.roleHistory.length, 1);
  const entry = fresh.roleHistory[0];
  assert.equal(entry.from, 'user');
  assert.equal(entry.to, 'admin');
  assert.equal(entry.changedByEmail, ADMIN_EMAIL);
});

const history = await req('GET', `/api/admin/users/${member.user.id}/role-history`, {
  token: admin.token,
});
await check('audit: the history endpoint returns the trail', () => {
  assert.equal(history.status, 200);
  assert.equal(history.body.data.history.length, 1);
  assert.equal(history.body.data.history[0].changedByEmail, ADMIN_EMAIL);
});

/* --- the promoted user really has admin power ------------------------- */
const promotedSession = await signIn(MEMBER_EMAIL, 'Ordinary Member');
await check('promote: the promoted user now signs in as admin', () =>
  assert.equal(promotedSession.user.role, 'admin'));
const promotedList = await req('GET', '/api/admin/users', {
  token: promotedSession.token,
});
await check('promote: the promoted user can now use admin endpoints', () =>
  assert.equal(promotedList.status, 200));

/* --- idempotence ------------------------------------------------------ */
const again = await req('PATCH', `/api/admin/users/${member.user.id}/role`, {
  token: admin.token,
  body: { role: 'admin' },
});
await check('promote: re-granting the same role is a no-op', () => {
  assert.equal(again.status, 200);
  assert.equal(again.body.data.changed, false);
});
await check('promote: a no-op does not add an audit entry', async () => {
  const fresh = await User.findById(member.user.id).lean();
  assert.equal(fresh.roleHistory.length, 1);
});

/* --- demotion --------------------------------------------------------- */
const demote = await req('PATCH', `/api/admin/users/${member.user.id}/role`, {
  token: admin.token,
  body: { role: 'user' },
});
await check('demote: an admin can revoke the role', () => {
  assert.equal(demote.body.data.role, 'user');
  assert.equal(demote.body.data.previousRole, 'admin');
});
await check('demote: the audit trail now has two entries', async () => {
  const fresh = await User.findById(member.user.id).lean();
  assert.equal(fresh.roleHistory.length, 2);
  assert.equal(fresh.roleHistory[1].to, 'user');
});

/* --- guard 2: an administrator must always remain ---------------------- */

/*
 * NOTE ON REACHABILITY. The explicit last-admin check in the controller is
 * defence in depth, and is currently UNREACHABLE — guard 1 gets there first:
 *
 *   to demote the last admin, the caller must be an admin;
 *   if the target is the last admin, the caller IS the target;
 *   self-edits are refused by guard 1.
 *
 * So rather than contriving an impossible state, this asserts the INVARIANT the
 * two guards exist to protect: no sequence of demotion attempts can leave the
 * application with zero administrators. The redundant check stays in place so
 * the invariant survives if guard 1 is ever relaxed.
 */
await check('invariant: no sequence of demotions can leave zero admins', async () => {
  // Sign in first — the account has to exist before it can be promoted.
  await signIn(SECOND_ADMIN, 'Second Admin');

  // Two admins, one plain member.
  await User.updateMany({ email: { $in: EMAILS } }, { $set: { role: 'user' } });
  const a = await User.findOne({ email: ADMIN_EMAIL });
  const b = await User.findOne({ email: SECOND_ADMIN });
  assert.ok(a && b, 'both accounts should exist');
  a.role = 'admin';
  b.role = 'admin';
  await Promise.all([a.save(), b.save()]);

  const aSession = await signIn(ADMIN_EMAIL, 'Role Admin');
  const bSession = await signIn(SECOND_ADMIN, 'Second Admin');

  // A demotes B: allowed, two admins existed.
  const first = await req('PATCH', `/api/admin/users/${b._id}/role`, {
    token: aSession.token,
    body: { role: 'user' },
  });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(await testAdminCount(), 1);

  // B, now demoted, cannot demote A.
  const byDemoted = await req('PATCH', `/api/admin/users/${a._id}/role`, {
    token: bSession.token,
    body: { role: 'user' },
  });
  assert.equal(byDemoted.status, 403, 'a demoted user must lose admin power');

  // A cannot demote themselves.
  const bySelf = await req('PATCH', `/api/admin/users/${a._id}/role`, {
    token: aSession.token,
    body: { role: 'user' },
  });
  assert.equal(bySelf.status, 400);

  // The invariant holds.
  assert.equal(
    await testAdminCount(),
    1,
    'exactly one admin must remain after every attempt',
  );
});

await check('invariant: a demoted admin immediately loses access', async () => {
  const b = await User.findOne({ email: SECOND_ADMIN });
  assert.equal(b.role, 'user', 'set up by the previous test');

  const bSession = await signIn(SECOND_ADMIN, 'Second Admin');
  const listAttempt = await req('GET', '/api/admin/users', { token: bSession.token });
  assert.equal(listAttempt.status, 403);
});

/* --- guard 3: sign-in never changes a role ---------------------------- */
await check('a revoked role stays revoked across re-login', async () => {
  // Give BOOTSTRAP_EMAIL admin the documented way, then revoke it in the UI.
  await signIn(BOOTSTRAP_EMAIL, 'Bootstrap User');
  await User.updateOne({ email: BOOTSTRAP_EMAIL }, { $set: { role: 'admin' } });
  const boot = await signIn(BOOTSTRAP_EMAIL, 'Bootstrap User');
  assert.equal(boot.user.role, 'admin');

  const solo = await User.findOne({ email: ADMIN_EMAIL });
  solo.role = 'admin';
  await solo.save();
  const soloSession = await signIn(ADMIN_EMAIL, 'Role Admin');

  const revoke = await req('PATCH', `/api/admin/users/${boot.user.id}/role`, {
    token: soloSession.token,
    body: { role: 'user' },
  });
  assert.equal(revoke.body.data.role, 'user');

  // The critical assertion: nothing re-grants it.
  const afterRelogin = await signIn(BOOTSTRAP_EMAIL, 'Bootstrap User');
  assert.equal(
    afterRelogin.user.role,
    'user',
    'sign-in must never restore a revoked role',
  );
});

await check('a granted role also survives re-login', async () => {
  const solo = await User.findOne({ email: ADMIN_EMAIL });
  solo.role = 'admin';
  await solo.save();
  const soloSession = await signIn(ADMIN_EMAIL, 'Role Admin');

  const target = await User.findOne({ email: MEMBER_EMAIL });
  await req('PATCH', `/api/admin/users/${target._id}/role`, {
    token: soloSession.token,
    body: { role: 'admin' },
  });

  const after = await signIn(MEMBER_EMAIL, 'Ordinary Member');
  assert.equal(after.user.role, 'admin', 'a granted role must persist');
});

/* --- input validation ------------------------------------------------- */
const solo = await User.findOne({ email: ADMIN_EMAIL });
solo.role = 'admin';
await solo.save();
const adminToken = (await signIn(ADMIN_EMAIL, 'Role Admin')).token;
const targetId = (await User.findOne({ email: MEMBER_EMAIL }))._id.toString();

const badRole = await req('PATCH', `/api/admin/users/${targetId}/role`, {
  token: adminToken,
  body: { role: 'superuser' },
});
await check('validation: an unknown role is rejected (400)', () =>
  assert.equal(badRole.status, 400));

const badId = await req('PATCH', '/api/admin/users/not-an-id/role', {
  token: adminToken,
  body: { role: 'admin' },
});
await check('validation: a malformed user id is rejected (400)', () =>
  assert.equal(badId.status, 400));

const missing = await req('PATCH', '/api/admin/users/507f1f77bcf86cd799439011/role', {
  token: adminToken,
  body: { role: 'admin' },
});
await check('validation: an unknown user id returns 404', () =>
  assert.equal(missing.status, 404));

console.log('\n' + results.join('\n'));
const passed = results.filter((r) => r.includes('PASS')).length;
const failed = results.filter((r) => r.includes('FAIL')).length;
console.log(`\n${passed} passed, ${failed} failed\n`);

await cleanup();
server.close();
await disconnectDB();
