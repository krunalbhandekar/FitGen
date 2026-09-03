import { Router } from 'express';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';

import { getMe, googleAuth, logout } from '../controllers/authController.js';
import {
  getExercise,
  getExerciseFilters,
  listExercises,
} from '../controllers/exerciseController.js';
import { getFood, listFoods } from '../controllers/foodController.js';
import {
  getStats,
  getUserRoleHistory,
  listUsers,
  updateUserRole,
} from '../controllers/adminController.js';
import {
  createExercise,
  createFood,
  deleteExercise,
  deleteFood,
  getExerciseUsage,
  getFoodUsage,
  updateExercise,
  updateFood,
} from '../controllers/contentController.js';
import {
  acknowledgeRegeneration,
  completeOnboarding,
  getProfile,
  getProfileOptions,
  previewTargets,
  updateProfile,
} from '../controllers/profileController.js';
import {
  createDietPlan,
  createWorkoutPlan,
  getDietHistory,
  getDietPlan,
  getDietPlanById,
  getPlanStatus,
  getWorkoutHistory,
  getWorkoutPlan,
  getWorkoutPlanById,
  getGroceryList,
  swapMeal,
} from '../controllers/planController.js';
import {
  createProgressLog,
  createWorkoutLog,
  deleteProgressLog,
  deleteWorkoutLog,
  getDayProgression,
  getProgressDashboard,
  getWorkoutLog,
  listProgressLogs,
  getAchievements,
  listWorkoutLogs,
} from '../controllers/logController.js';
import {
  ask,
  browseKnowledge,
  clearHistory,
  getHistory,
  getMeta,
  getSessions,
} from '../controllers/chatController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// Sign-in is the one unauthenticated write endpoint, so it gets its own limit.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many sign-in attempts, try again later' },
});

router.get('/health', (_req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  res.json({
    success: true,
    status: 'ok',
    db: states[mongoose.connection.readyState] ?? 'unknown',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// --- Auth ---
router.post('/auth/google', authLimiter, googleAuth);
router.get('/auth/me', requireAuth, getMe);
router.post('/auth/logout', requireAuth, logout);

// --- Profile, onboarding & deterministic targets (Phase 2) ---
router.get('/profile/options', requireAuth, getProfileOptions);
router.post('/profile/targets/preview', requireAuth, previewTargets);
router.put('/profile/onboarding', requireAuth, completeOnboarding);
router.post('/profile/regeneration/acknowledge', requireAuth, acknowledgeRegeneration);
router.get('/profile', requireAuth, getProfile);
router.patch('/profile', requireAuth, updateProfile);

// --- AI plan generation (Phase 3) ---
// Generation is rate-limited separately: each call hits an external LLM, so it
// is far more expensive than a normal read.
const generationLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.user?._id?.toString() ?? req.ip,
  message: {
    success: false,
    message: 'Too many plan generations. Please wait a few minutes.',
  },
});

router.get('/plans/status', requireAuth, getPlanStatus);
router.post('/plans/workout/generate', requireAuth, generationLimiter, createWorkoutPlan);
router.get('/plans/workout/history', requireAuth, getWorkoutHistory);
router.get('/plans/workout', requireAuth, getWorkoutPlan);
// Registered after /history so the literal path wins over the :id parameter.
router.get('/plans/workout/:id', requireAuth, getWorkoutPlanById);
router.post('/plans/diet/generate', requireAuth, generationLimiter, createDietPlan);
router.get('/plans/diet/grocery', requireAuth, getGroceryList);
router.get('/plans/diet/history', requireAuth, getDietHistory);
router.get('/plans/diet', requireAuth, getDietPlan);
router.get('/plans/diet/:id', requireAuth, getDietPlanById);
router.post('/plans/diet/meals/:order/swap', requireAuth, generationLimiter, swapMeal);

// --- Logging & progress (Phase 4) ---
// `/dashboard` and `/progression` before the `:id` routes so the literal paths win.
router.get('/logs/dashboard', requireAuth, getProgressDashboard);
router.get('/logs/achievements', requireAuth, getAchievements);
router.get('/logs/progression/:dayIndex', requireAuth, getDayProgression);
router.post('/logs/workout', requireAuth, createWorkoutLog);
router.get('/logs/workout', requireAuth, listWorkoutLogs);
router.get('/logs/workout/:id', requireAuth, getWorkoutLog);
router.delete('/logs/workout/:id', requireAuth, deleteWorkoutLog);
router.post('/logs/progress', requireAuth, createProgressLog);
router.get('/logs/progress', requireAuth, listProgressLogs);
router.delete('/logs/progress/:id', requireAuth, deleteProgressLog);

// --- RAG chatbot (Phase 5) ---
// Shares the generation rate limit: each question can hit the LLM.
router.get('/chat/meta', requireAuth, getMeta);
router.get('/chat/knowledge', requireAuth, browseKnowledge);
router.get('/chat/sessions', requireAuth, getSessions);
router.get('/chat/history', requireAuth, getHistory);
router.delete('/chat/history', requireAuth, clearHistory);
router.post('/chat', requireAuth, generationLimiter, ask);

// --- Verified exercise database (auth required: it powers a member feature) ---
router.get('/exercises/filters', requireAuth, getExerciseFilters);
router.get('/exercises/:slug', requireAuth, getExercise);
router.get('/exercises', requireAuth, listExercises);

// --- Verified food database ---
router.get('/foods/:slug', requireAuth, getFood);
router.get('/foods', requireAuth, listFoods);

// --- Admin (RBAC) ---
router.get('/admin/stats', requireAuth, requireRole('admin'), getStats);
router.get('/admin/users', requireAuth, requireRole('admin'), listUsers);
router.get(
  '/admin/users/:id/role-history',
  requireAuth,
  requireRole('admin'),
  getUserRoleHistory,
);
router.patch(
  '/admin/users/:id/role',
  requireAuth,
  requireRole('admin'),
  updateUserRole,
);

// --- Admin content management (Phase 6) ---
const adminOnly = [requireAuth, requireRole('admin')];

router.post('/admin/exercises', ...adminOnly, createExercise);
router.get('/admin/exercises/:slug/usage', ...adminOnly, getExerciseUsage);
router.patch('/admin/exercises/:slug', ...adminOnly, updateExercise);
router.delete('/admin/exercises/:slug', ...adminOnly, deleteExercise);

router.post('/admin/foods', ...adminOnly, createFood);
router.get('/admin/foods/:slug/usage', ...adminOnly, getFoodUsage);
router.patch('/admin/foods/:slug', ...adminOnly, updateFood);
router.delete('/admin/foods/:slug', ...adminOnly, deleteFood);

export default router;
