import mongoose from 'mongoose';
import { z } from 'zod';

import { Exercise } from '../models/Exercise.js';
import { Food } from '../models/Food.js';
import { User } from '../models/User.js';
import { formatZodError } from '../validation/profileSchemas.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';

/**
 * GET /api/admin/stats
 *
 * Aggregate-only by design: an admin sees counts and distributions, never an
 * individual user's profile data. This is the RBAC boundary described in the
 * project report.
 */
export const getStats = asyncHandler(async (_req, res) => {
  const [
    totalUsers,
    admins,
    onboarded,
    newThisWeek,
    exercises,
    foods,
    byEquipment,
    byMuscle,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: 'admin' }),
    User.countDocuments({ onboardingCompleted: true }),
    User.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    }),
    Exercise.countDocuments(),
    Food.countDocuments(),
    Exercise.aggregate([
      { $group: { _id: '$equipment', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    Exercise.aggregate([
      { $unwind: '$primaryMuscles' },
      { $group: { _id: '$primaryMuscles', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
  ]);

  const shape = (rows) =>
    rows.map(({ _id, count }) => ({ label: _id ?? 'unspecified', count }));

  res.json({
    success: true,
    data: {
      users: { total: totalUsers, admins, onboarded, newThisWeek },
      database: { exercises, foods },
      exercisesByEquipment: shape(byEquipment),
      exercisesByMuscle: shape(byMuscle),
    },
  });
});

/* ====================================================== user role management */

/**
 * Fields an administrator may see about an individual user.
 *
 * DELIBERATELY NARROW. Role management needs identity and status, and nothing
 * more — no profile, no plans, no logs, no chat history. That keeps the RBAC
 * boundary as tight as the feature allows: an admin can see WHO exists in order
 * to grant access, but not what any of them recorded.
 */
const ADMIN_USER_FIELDS =
  'email name avatarUrl role onboardingCompleted createdAt lastLoginAt roleManagedAt';

/**
 * GET /api/admin/users?search=&role=&page=&limit=
 *
 * The user roster, for granting and revoking the admin role.
 */
export const listUsers = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);

  const filter = {};

  const search = String(req.query.search ?? '').trim();
  if (search) {
    const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { email: { $regex: safe, $options: 'i' } },
      { name: { $regex: safe, $options: 'i' } },
    ];
  }

  if (req.query.role === 'admin' || req.query.role === 'user') {
    filter.role = req.query.role;
  }

  const [users, total, adminCount] = await Promise.all([
    User.find(filter)
      .select(ADMIN_USER_FIELDS)
      .sort({ role: 1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
    User.countDocuments({ role: 'admin' }),
  ]);

  res.json({
    success: true,
    data: users.map((user) => ({
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
      onboardingCompleted: user.onboardingCompleted,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      roleManagedAt: user.roleManagedAt,
      isSelf: user._id.toString() === req.user._id.toString(),
    })),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
      adminCount,
    },
  });
});

const roleSchema = z.object({ role: z.enum(['user', 'admin']) });

/**
 * PATCH /api/admin/users/:id/role
 *
 * Grants or revokes the admin role. Three guards, each preventing a way this
 * could go wrong:
 *
 *  1. You cannot change your own role — that blocks both accidental
 *     self-demotion and an admin quietly re-granting themselves after review.
 *  2. The last remaining admin cannot be demoted, which would lock the
 *     application out of administration entirely.
 *  3. Every change is recorded with who made it, so privilege escalation is
 *     never anonymous.
 */
export const updateUserRole = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw ApiError.badRequest('Invalid user id');
  }

  const parsed = roleSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw ApiError.badRequest('Validation failed', formatZodError(parsed.error));
  }
  const { role } = parsed.data;

  // Guard 1: never your own role.
  if (req.params.id === req.user._id.toString()) {
    throw ApiError.badRequest(
      'You cannot change your own role. Ask another administrator to do it.',
    );
  }

  const target = await User.findById(req.params.id);
  if (!target) throw ApiError.notFound('User not found');

  if (target.role === role) {
    return res.json({
      success: true,
      message: `${target.email} is already ${role}`,
      data: { id: target._id.toString(), role: target.role, changed: false },
    });
  }

  // Guard 2: never remove the last administrator.
  if (target.role === 'admin' && role === 'user') {
    const adminCount = await User.countDocuments({ role: 'admin' });
    if (adminCount <= 1) {
      throw ApiError.badRequest(
        'This is the only administrator — promote someone else before revoking it.',
      );
    }
  }

  const previous = target.role;
  target.role = role;
  target.roleManagedAt = new Date();
  target.roleManagedBy = req.user._id;
  // Guard 3: audit trail.
  target.roleHistory.push({
    from: previous,
    to: role,
    changedBy: req.user._id,
    changedByEmail: req.user.email,
    at: new Date(),
  });
  await target.save();

  res.json({
    success: true,
    message:
      role === 'admin'
        ? `${target.email} is now an administrator`
        : `Administrator access revoked for ${target.email}`,
    data: {
      id: target._id.toString(),
      email: target.email,
      role: target.role,
      previousRole: previous,
      changed: true,
    },
  });
});

/** GET /api/admin/users/:id/role-history — audit trail for one user. */
export const getUserRoleHistory = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw ApiError.badRequest('Invalid user id');
  }

  const user = await User.findById(req.params.id)
    .select('email name role roleHistory roleManagedAt')
    .lean();
  if (!user) throw ApiError.notFound('User not found');

  res.json({
    success: true,
    data: {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      roleManagedAt: user.roleManagedAt,
      history: [...(user.roleHistory ?? [])].reverse(),
    },
  });
});
