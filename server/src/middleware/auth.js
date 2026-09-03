import { User } from '../models/User.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { verifyToken } from '../utils/jwt.js';

const extractBearer = (req) => {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
};

/** Requires a valid FitGen JWT and attaches the live user document. */
export const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = extractBearer(req);
  if (!token) throw ApiError.unauthorized('Missing Bearer token');

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    const message =
      err.name === 'TokenExpiredError'
        ? 'Session expired, please sign in again'
        : 'Invalid session token';
    throw ApiError.unauthorized(message);
  }

  // Loading the user (rather than trusting the token's role claim) means a
  // role change or account deletion takes effect immediately.
  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('Account no longer exists');

  req.user = user;
  next();
});

/**
 * RBAC gate. Use after `requireAuth`:
 *   router.get('/admin/stats', requireAuth, requireRole('admin'), handler)
 */
export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(
        ApiError.forbidden(`This action requires role: ${roles.join(' or ')}`),
      );
    }
    return next();
  };
