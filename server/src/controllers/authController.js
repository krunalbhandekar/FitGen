import { User } from '../models/User.js';
import { verifyGoogleIdToken } from '../services/googleAuth.js';
import { asyncHandler } from '../utils/ApiError.js';
import { signToken } from '../utils/jwt.js';

/**
 * POST /api/auth/google
 *
 * Single entry point for both sign-up and sign-in: if the Google account has
 * never been seen it is created, otherwise the existing record is refreshed.
 * Returns a FitGen JWT the client sends as a Bearer token.
 */
export const googleAuth = asyncHandler(async (req, res) => {
  const { credential } = req.body ?? {};
  const googleUser = await verifyGoogleIdToken(credential);

  let user = await User.findOne({
    $or: [{ googleId: googleUser.googleId }, { email: googleUser.email }],
  });

  const isNewUser = !user;

  if (isNewUser) {
    user = await User.create({
      googleId: googleUser.googleId,
      email: googleUser.email,
      name: googleUser.name,
      avatarUrl: googleUser.avatarUrl,
      /*
       * Every new account is a plain member. Roles are granted ONLY through the
       * admin interface — there is no environment variable and no automatic
       * promotion at sign-in.
       *
       * That leaves one bootstrap step on a brand-new database: the first
       * administrator has to be set directly in MongoDB, because with no admin
       * there is nobody who can grant the role. See the README.
       */
      role: 'user',
      authProvider: 'google',
      emailVerified: true,
      lastLoginAt: new Date(),
    });
  } else {
    // Keep Google-owned fields fresh; never downgrade a manually granted admin.
    user.googleId = googleUser.googleId;
    user.name = googleUser.name;
    user.avatarUrl = googleUser.avatarUrl;
    user.lastLoginAt = new Date();
    // Roles are never changed at sign-in: they are managed only through the
    // admin interface, so whatever an administrator set is what persists.
    await user.save();
  }

  res.status(isNewUser ? 201 : 200).json({
    success: true,
    isNewUser,
    token: signToken(user),
    user: user.toPublicJSON(),
  });
});

/** GET /api/auth/me — rehydrates the session on page load. */
export const getMe = asyncHandler(async (req, res) => {
  res.json({ success: true, user: req.user.toPublicJSON() });
});

/**
 * POST /api/auth/logout
 *
 * Tokens are stateless and held client-side, so this is an acknowledgement
 * endpoint the client calls before clearing storage. A server-side token
 * denylist is noted as future scope.
 */
export const logout = asyncHandler(async (_req, res) => {
  res.json({ success: true, message: 'Signed out' });
});
