import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { z } from 'zod';

import { knowledgeBase, KNOWLEDGE_CATEGORIES } from '../data/knowledgeBase.js';
import { CHAT_RETENTION_DAYS, ChatMessage } from '../models/ChatMessage.js';
import {
  answerQuestion,
  getKnowledgeStats,
  getSuggestions,
} from '../services/chatService.js';
import { isGroqConfigured } from '../services/groqClient.js';
import { formatZodError } from '../validation/profileSchemas.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';

const askSchema = z.object({
  question: z.string().trim().min(3, 'Ask a slightly longer question').max(1000),
  sessionId: z.string().trim().max(64).optional(),
  inputMode: z.enum(['text', 'voice']).optional().default('text'),
});

/** How many prior turns are fed back as conversational context. */
const HISTORY_TURNS = 3;

/**
 * POST /api/chat
 *
 * Asks the RAG assistant. The exchange is persisted with its retrieval trace so
 * answers stay auditable.
 */
export const ask = asyncHandler(async (req, res) => {
  const parsed = askSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw ApiError.badRequest('Validation failed', formatZodError(parsed.error));
  }
  const { question, inputMode } = parsed.data;
  const sessionId = parsed.data.sessionId || crypto.randomUUID();

  const profile = req.user.profile?.toObject
    ? req.user.profile.toObject()
    : (req.user.profile ?? {});

  // Prior turns in this session, oldest first, for follow-up questions.
  const previous = await ChatMessage.find({ userId: req.user._id, sessionId })
    .sort({ createdAt: -1 })
    .limit(HISTORY_TURNS)
    .select('question answer')
    .lean();

  const history = previous.reverse().map((m) => ({ question: m.question, answer: m.answer }));

  const result = await answerQuestion({ question, profile, history });

  const saved = await ChatMessage.create({
    userId: req.user._id,
    sessionId,
    question,
    answer: result.answer,
    citations: result.citations,
    retrieval: result.retrieval,
    grounded: result.grounded,
    refused: result.refused,
    refusalReason: result.refusalReason,
    outOfScope: Boolean(result.outOfScope),
    inputMode,
    generation: result.generation,
  });

  // Expand citation ids into the titles the UI displays.
  const byId = new Map(knowledgeBase.map((e) => [e.id, e]));
  const sources = result.citations
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((entry) => ({
      id: entry.id,
      title: entry.title,
      category: entry.category,
      categoryLabel: KNOWLEDGE_CATEGORIES[entry.category] ?? entry.category,
    }));

  res.status(201).json({
    success: true,
    data: {
      id: saved._id,
      sessionId,
      question,
      answer: result.answer,
      sources,
      retrieval: result.retrieval,
      grounded: result.grounded,
      refused: result.refused,
      outOfScope: Boolean(result.outOfScope),
      suggestFollowUp: result.suggestFollowUp ?? [],
      generation: result.generation,
      createdAt: saved.createdAt,
    },
  });
});

/**
 * GET /api/chat/history?sessionId=&limit=
 * Without a sessionId, returns the most recent exchanges across all sessions.
 */
export const getHistory = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const filter = { userId: req.user._id };
  if (req.query.sessionId) filter.sessionId = String(req.query.sessionId);

  const messages = await ChatMessage.find(filter)
    .sort({ createdAt: req.query.sessionId ? 1 : -1 })
    .limit(limit)
    .lean();

  const byId = new Map(knowledgeBase.map((e) => [e.id, e]));

  res.json({
    success: true,
    data: messages.map((m) => ({
      id: m._id,
      sessionId: m.sessionId,
      question: m.question,
      answer: m.answer,
      sources: (m.citations ?? [])
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((e) => ({
          id: e.id,
          title: e.title,
          category: e.category,
          categoryLabel: KNOWLEDGE_CATEGORIES[e.category] ?? e.category,
        })),
      retrieval: m.retrieval ?? [],
      grounded: m.grounded,
      refused: m.refused,
      outOfScope: m.outOfScope,
      inputMode: m.inputMode,
      generation: m.generation,
      createdAt: m.createdAt,
    })),
    meta: { returned: messages.length },
  });
});

/** GET /api/chat/sessions — conversation list for a history sidebar. */
export const getSessions = asyncHandler(async (req, res) => {
  const sessions = await ChatMessage.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(req.user._id) } },
    { $sort: { createdAt: 1 } },
    {
      $group: {
        _id: '$sessionId',
        firstQuestion: { $first: '$question' },
        messages: { $sum: 1 },
        startedAt: { $first: '$createdAt' },
        lastAt: { $last: '$createdAt' },
      },
    },
    { $sort: { lastAt: -1 } },
    { $limit: 30 },
  ]);

  res.json({
    success: true,
    data: sessions.map((s) => ({
      sessionId: s._id,
      title: s.firstQuestion.slice(0, 70),
      messages: s.messages,
      startedAt: s.startedAt,
      lastAt: s.lastAt,
    })),
  });
});

/** DELETE /api/chat/history?sessionId= — clears one session, or everything. */
export const clearHistory = asyncHandler(async (req, res) => {
  const filter = { userId: req.user._id };
  if (req.query.sessionId) filter.sessionId = String(req.query.sessionId);

  const { deletedCount } = await ChatMessage.deleteMany(filter);
  res.json({
    success: true,
    message: `Cleared ${deletedCount} message${deletedCount === 1 ? '' : 's'}`,
    deletedCount,
  });
});

/**
 * GET /api/chat/meta
 * What the chat UI needs before the first question: scope, starters, and
 * whether AI phrasing is available.
 */
export const getMeta = asyncHandler(async (_req, res) => {
  const stats = getKnowledgeStats();

  res.json({
    success: true,
    data: {
      aiAvailable: isGroqConfigured(),
      knowledge: {
        ...stats,
        categories: Object.entries(stats.byCategory).map(([key, count]) => ({
          key,
          label: KNOWLEDGE_CATEGORIES[key] ?? key,
          count,
        })),
      },
      suggestions: getSuggestions(),
      // Disclosed so the UI can state the policy rather than storing silently.
      retentionDays: CHAT_RETENTION_DAYS,
      // Stated plainly in the UI so users know the boundary up front.
      scope:
        'Training and programming, exercise technique, recovery and sleep, and evidence-based supplements and nutrition. Not medical advice — it will not diagnose injuries or advise on medication.',
    },
  });
});

/**
 * GET /api/chat/knowledge — browsable knowledge base.
 *
 * Exposing the corpus is part of the grounding story: a user can read exactly
 * what the assistant is allowed to know.
 */
export const browseKnowledge = asyncHandler(async (req, res) => {
  const category = req.query.category ? String(req.query.category) : null;

  const entries = knowledgeBase
    .filter((e) => !category || e.category === category)
    .map((e) => ({
      id: e.id,
      title: e.title,
      category: e.category,
      categoryLabel: KNOWLEDGE_CATEGORIES[e.category] ?? e.category,
      questions: e.questions,
      answer: e.answer,
    }));

  res.json({ success: true, data: entries, meta: { total: entries.length } });
});
