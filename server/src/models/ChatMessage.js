import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * One question-and-answer exchange (the report's `chatHistory` collection).
 *
 * Retrieval metadata is stored alongside the answer, not discarded: it records
 * which knowledge-base entries were consulted and how strongly they matched,
 * which is what makes an answer auditable after the fact. `grounded` and
 * `refused` let the admin view distinguish a correct refusal from a failure.
 */
const chatMessageSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Groups a run of exchanges into one conversation.
    sessionId: { type: String, required: true, index: true },

    question: { type: String, required: true, maxlength: 1000 },
    answer: { type: String, required: true },

    // Knowledge-base ids the answer was built from.
    citations: { type: [String], default: [] },
    retrieval: {
      type: [
        {
          _id: false,
          id: String,
          title: String,
          category: String,
          score: Number,
        },
      ],
      default: [],
    },

    grounded: { type: Boolean, default: false },
    refused: { type: Boolean, default: false },
    refusalReason: String,
    outOfScope: { type: Boolean, default: false },

    // How the question arrived — voice input is a Phase 5 feature worth measuring.
    inputMode: { type: String, enum: ['text', 'voice'], default: 'text' },

    generation: {
      generatedBy: { type: String, enum: ['groq', 'fallback', 'rule', 'safety-rule'] },
      model: String,
      attempts: Number,
      durationMs: Number,
      warnings: { type: [String], default: [] },
    },
  },
  {
    timestamps: true,
    /*
     * Pinned explicitly. Mongoose would otherwise derive "chatmessages" from
     * the model name, while the project report specifies `chatHistory` — and a
     * submitted document that disagrees with the database is a defect.
     */
    collection: 'chatHistory',
  },
);

chatMessageSchema.index({ userId: 1, createdAt: -1 });
chatMessageSchema.index({ userId: 1, sessionId: 1, createdAt: 1 });

/**
 * Retention: conversations are pruned automatically after 90 days.
 *
 * MongoDB's TTL monitor sweeps roughly once a minute and drops documents whose
 * indexed date is older than the window. TTL requires its own single-field
 * index — the compound `userId_1_createdAt_-1` above cannot serve it.
 *
 * Storing conversations indefinitely with no stated policy is poor practice, so
 * the window is bounded here and disclosed in the chat UI.
 */
export const CHAT_RETENTION_DAYS = 90;

chatMessageSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: CHAT_RETENTION_DAYS * 24 * 60 * 60, name: 'chat_ttl' },
);

export const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);
