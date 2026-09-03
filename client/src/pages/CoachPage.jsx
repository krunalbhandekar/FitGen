import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Bot,
  ChevronDown,
  History,
  Info,
  Mic,
  MicOff,
  Plus,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import { Badge, Button, cx, ErrorState, Spinner } from "../components/ui";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";

/**
 * RAG coach chat.
 *
 * The provenance of every answer is shown, not hidden: which knowledge-base
 * entries it came from, whether it was grounded, and when the assistant
 * declined. That transparency is the point of the architecture — a user (or an
 * examiner) can check what the answer was built from.
 */

const newSessionId = () =>
  crypto.randomUUID?.() ??
  `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * The active session id is persisted so a page reload resumes the conversation
 * instead of appearing to lose it. Only the id lives in storage — the messages
 * themselves are re-fetched from the server, which stays the source of truth.
 */
const SESSION_KEY = 'fitgen.coach.session';

const loadSessionId = () => {
  try {
    return localStorage.getItem(SESSION_KEY) || newSessionId();
  } catch {
    return newSessionId();
  }
};

const rememberSessionId = (id) => {
  try {
    localStorage.setItem(SESSION_KEY, id);
  } catch {
    /* private mode: the session simply won't survive a reload */
  }
};

/** Maps a stored exchange onto the two bubbles the UI renders for it. */
const toBubbles = (message) => [
  {
    role: 'user',
    key: `u-${message.id}`,
    text: message.question,
    viaVoice: message.inputMode === 'voice',
  },
  { role: 'assistant', key: message.id, ...message },
];

const relativeDate = (value) => {
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

/* --------------------------------------------------------------- messages */

const UserBubble = ({ text, viaVoice }) => (
  <li className="flex justify-end">
    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-volt px-4 py-2.5 text-sm font-medium text-ink">
      {viaVoice && (
        <span className="mb-1 flex items-center gap-1 text-[0.625rem] font-bold tracking-wide uppercase opacity-70">
          <Mic size={10} aria-hidden="true" />
          Voice
        </span>
      )}
      {text}
    </div>
  </li>
);

const AssistantBubble = ({ message }) => {
  const [showTrace, setShowTrace] = useState(false);

  return (
    <li className="flex gap-3">
      <span
        className={cx(
          "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full",
          message.refused ? "bg-ember/15 text-ember" : "bg-volt/15 text-volt",
        )}
        aria-hidden="true"
      >
        {message.refused ? <ShieldAlert size={15} /> : <Bot size={15} />}
      </span>

      <div className="min-w-0 flex-1">
        <div
          className={cx(
            "rounded-2xl rounded-tl-md border p-4",
            message.refused
              ? "border-ember/30 bg-ember/8"
              : "border-line bg-panel",
          )}
        >
          {/* Preserve the paragraph breaks the model produced. */}
          {message.answer
            .split("\n")
            .filter(Boolean)
            .map((para, i) => (
              <p
                key={i}
                className={cx("text-sm leading-relaxed", i > 0 && "mt-3")}
              >
                {para}
              </p>
            ))}

          {/* Provenance */}
          {message.sources?.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <p className="eyebrow flex items-center gap-1.5">
                <ShieldCheck
                  size={11}
                  className="text-volt"
                  aria-hidden="true"
                />
                From the knowledge base
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {message.sources.map((source) => (
                  <li key={source.id}>
                    <Badge tone="neutral">
                      {source.title}
                      <span className="ml-1 opacity-60">
                        · {source.categoryLabel}
                      </span>
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {message.outOfScope && (
            <p className="mt-3 flex items-start gap-1.5 border-t border-line pt-3 text-xs text-fog-dim">
              <Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
              Nothing in the knowledge base matched, so no answer was generated
              — the assistant will not answer from outside it.
            </p>
          )}

          {/* Retrieval trace — the evidence behind the citation chips */}
          {message.retrieval?.length > 0 && (
            <div className="mt-3 border-t border-line pt-3">
              <button
                type="button"
                onClick={() => setShowTrace((s) => !s)}
                aria-expanded={showTrace}
                className="text-xs text-fog-dim transition-colors hover:text-chalk"
              >
                {showTrace ? "Hide" : "Show"} retrieval scores
              </button>
              {showTrace && (
                <ul className="mt-2 space-y-1">
                  {message.retrieval.map((hit) => (
                    <li
                      key={hit.id}
                      className="flex items-center gap-2 text-[0.6875rem] text-fog-dim"
                    >
                      <span className="w-10 shrink-0 text-right font-semibold tabular-nums">
                        {hit.score.toFixed(3)}
                      </span>
                      <span className="h-1 max-w-24 flex-1 overflow-hidden rounded-full bg-panel-2">
                        <span
                          className="block h-full rounded-full bg-volt"
                          style={{
                            width: `${Math.min(hit.score * 100, 100)}%`,
                          }}
                        />
                      </span>
                      <span className="truncate">{hit.title}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Meta line */}
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 px-1 text-[0.625rem] text-fog-dim">
          {message.refused ? (
            <span className="font-semibold text-ember uppercase">Declined</span>
          ) : message.grounded ? (
            <span className="flex items-center gap-1 font-semibold text-volt uppercase">
              <ShieldCheck size={10} aria-hidden="true" />
              Grounded
            </span>
          ) : (
            <span className="font-semibold uppercase">Not grounded</span>
          )}
          {message.generation?.generatedBy === "fallback" && (
            <span>· knowledge base verbatim</span>
          )}
          {message.generation?.durationMs != null && (
            <span>· {(message.generation.durationMs / 1000).toFixed(1)}s</span>
          )}
        </p>

        {/* Follow-up suggestions */}
        {message.suggestFollowUp?.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {message.suggestFollowUp.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => message.onAsk?.(s)}
                  className="rounded-full border border-line px-3 py-1.5 text-xs text-fog transition-colors hover:border-volt hover:text-volt"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
};

/* ------------------------------------------------------- knowledge browser */

/**
 * Browsable corpus — the "here is everything it may know" panel.
 *
 * The whole knowledge base is fetched ONCE and filtered in the browser. An
 * earlier version refetched per category, which had two problems: a network
 * round-trip on every chip click for 38 tiny records, and — because the chip
 * list was derived from the *filtered* response — selecting a category made
 * every other category disappear. The category list is now built from the
 * complete set, so it stays stable whatever is selected.
 */
const KnowledgePanel = ({ onClose, onAsk }) => {
  const [allEntries, setAllEntries] = useState(null);
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(null);

  useEffect(() => {
    api
      .get("/chat/knowledge")
      .then(({ data }) => setAllEntries(data.data))
      .catch(() => setAllEntries([]));
  }, []);

  /** Built from the FULL set, so every category is always offered. */
  const categories = useMemo(() => {
    const counts = new Map();
    for (const entry of allEntries ?? []) {
      const existing = counts.get(entry.category);
      if (existing) existing.count += 1;
      else
        counts.set(entry.category, {
          key: entry.category,
          // The API supplies the display label; the raw key is not it
          // ("form" is shown as "Technique").
          label: entry.categoryLabel ?? entry.category,
          count: 1,
        });
    }
    return [...counts.values()].sort((a, b) => b.count - a.count);
  }, [allEntries]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (allEntries ?? []).filter((entry) => {
      if (category && entry.category !== category) return false;
      if (!needle) return true;
      return (
        entry.title.toLowerCase().includes(needle) ||
        entry.answer.toLowerCase().includes(needle) ||
        entry.questions.some((q) => q.toLowerCase().includes(needle))
      );
    });
  }, [allEntries, category, query]);

  const total = allEntries?.length ?? 0;
  const filtering = Boolean(category || query.trim());

  return (
    <aside className="panel flex max-h-[calc(100vh-8rem)] flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-bold">
            <BookOpen size={16} className="text-volt" aria-hidden="true" />
            Knowledge base
          </h2>
          <p className="mt-0.5 text-xs text-fog-dim">
            Everything the coach is allowed to know. Nothing else.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close knowledge base"
          className="grid size-8 shrink-0 place-items-center rounded-lg border border-line text-fog-dim hover:text-chalk lg:hidden"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>

      {allEntries === null ? (
        <Spinner label="Loading" />
      ) : (
        <>
          {/* Search */}
          <div className="relative mt-4">
            <Search
              size={14}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fog-dim"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${total} entries…`}
              aria-label="Search the knowledge base"
              className="h-9 w-full rounded-lg border border-line bg-panel-2 pr-8 pl-8 text-xs placeholder:text-fog-dim focus:border-volt focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute top-1/2 right-2.5 -translate-y-1/2 text-fog-dim hover:text-chalk"
              >
                <X size={13} aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Categories — all always shown, the active one highlighted. Wraps
              rather than scrolling sideways, which is unusable in a sidebar. */}
          <div
            role="group"
            aria-label="Filter by category"
            className="mt-3 flex flex-wrap gap-1.5"
          >
            <button
              type="button"
              onClick={() => setCategory("")}
              aria-pressed={category === ""}
              className={cx(
                "rounded-full border px-2.5 py-1 text-[0.6875rem] font-semibold transition-colors",
                category === ""
                  ? "border-volt bg-volt text-ink"
                  : "border-line text-fog hover:border-line-bright hover:text-chalk",
              )}
            >
              All
              <span className="ml-1 opacity-60">{total}</span>
            </button>

            {categories.map((c) => {
              const active = category === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(active ? "" : c.key)}
                  aria-pressed={active}
                  className={cx(
                    "rounded-full border px-2.5 py-1 text-[0.6875rem] font-semibold transition-colors",
                    active
                      ? "border-volt bg-volt text-ink"
                      : "border-line text-fog hover:border-line-bright hover:text-chalk",
                  )}
                >
                  {c.label}
                  <span className="ml-1 opacity-60">{c.count}</span>
                </button>
              );
            })}
          </div>

          {/* Result count, so a filtered view never looks like the whole corpus */}
          <p className="mt-3 flex items-center gap-2 text-[0.625rem] text-fog-dim">
            Showing {visible.length} of {total}
            {filtering && (
              <button
                type="button"
                onClick={() => {
                  setCategory("");
                  setQuery("");
                }}
                className="text-fog underline decoration-line-bright underline-offset-2 hover:text-volt"
              >
                Reset
              </button>
            )}
          </p>

          <ul className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto">
            {visible.length === 0 && (
              <li className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-fog-dim">
                Nothing matches that search.
              </li>
            )}

            {visible.map((entry) => (
              <li key={entry.id} className="rounded-lg border border-line">
                <button
                  type="button"
                  onClick={() => setOpen(open === entry.id ? null : entry.id)}
                  aria-expanded={open === entry.id}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:text-volt"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{entry.title}</span>
                    {/* Category shown per row, so it stays identifiable in the
                        unfiltered list. */}
                    <span className="mt-0.5 block text-[0.625rem] text-fog-dim">
                      {entry.categoryLabel ?? entry.category}
                    </span>
                  </span>
                  <ChevronDown
                    size={14}
                    aria-hidden="true"
                    className={cx(
                      "shrink-0 text-fog-dim transition-transform",
                      open === entry.id && "rotate-180",
                    )}
                  />
                </button>

                {open === entry.id && (
                  <div className="border-t border-line px-3 py-3">
                    <p className="text-xs leading-relaxed text-fog">{entry.answer}</p>
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {entry.questions.slice(0, 3).map((q) => (
                        <li key={q}>
                          <button
                            type="button"
                            onClick={() => onAsk(q)}
                            className="rounded-full border border-line px-2.5 py-1 text-[0.6875rem] text-fog-dim transition-colors hover:border-volt hover:text-volt"
                          >
                            Ask: {q}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
};

/* ---------------------------------------------------- conversations list */

/**
 * Recent conversations. Deliberately compact — this is a chatbot, not a
 * messenger, so it exists to resume where you left off and to make "clear
 * history" mean something, not to be an archive worth browsing.
 */
const ConversationList = ({ sessions, activeId, onOpen, onDelete, retentionDays }) => {
  if (sessions.length === 0) return null;

  return (
    <section className="panel p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <History size={14} className="text-fog-dim" aria-hidden="true" />
          Recent chats
        </h2>
        <span className="text-[0.625rem] text-fog-dim">{sessions.length}</span>
      </div>

      <ul className="mt-3 space-y-1">
        {sessions.map((session) => {
          const active = session.sessionId === activeId;
          return (
            <li key={session.sessionId} className="group flex items-center gap-1">
              <button
                type="button"
                onClick={() => onOpen(session.sessionId)}
                aria-current={active ? 'true' : undefined}
                className={cx(
                  'min-w-0 flex-1 rounded-lg px-2.5 py-2 text-left transition-colors',
                  active ? 'bg-volt/10' : 'hover:bg-panel-2',
                )}
              >
                <span
                  className={cx(
                    'block truncate text-xs font-semibold',
                    active ? 'text-volt' : 'text-chalk',
                  )}
                >
                  {session.title}
                </span>
                <span className="mt-0.5 block text-[0.625rem] text-fog-dim">
                  {session.messages} message{session.messages === 1 ? '' : 's'} ·{' '}
                  {relativeDate(session.lastAt)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onDelete(session.sessionId)}
                aria-label={`Delete conversation: ${session.title}`}
                className="grid size-7 shrink-0 place-items-center rounded-lg text-fog-dim opacity-0 transition-all group-hover:opacity-100 hover:bg-ember/15 hover:text-ember focus-visible:opacity-100"
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>

      {retentionDays && (
        <p className="mt-3 border-t border-line pt-2.5 text-[0.625rem] leading-relaxed text-fog-dim">
          Conversations are kept for {retentionDays} days, then deleted
          automatically.
        </p>
      )}
    </section>
  );
};

/* -------------------------------------------------------------------- page */

export const CoachPage = () => {
  const [meta, setMeta] = useState(null);
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState(loadSessionId);
  const [sessions, setSessions] = useState([]);
  const [restoring, setRestoring] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [sendError, setSendError] = useState(null);
  const [showKnowledge, setShowKnowledge] = useState(false);

  const listEndRef = useRef(null);
  const inputRef = useRef(null);
  const voiceSubmitRef = useRef(false);

  /* --- voice input ------------------------------------------------------- */
  const speech = useSpeechRecognition({
    onResult: (text) => {
      setInput(text);
      // Mark that the next send came from speech, for the stored inputMode.
      voiceSubmitRef.current = true;
      inputRef.current?.focus();
    },
  });

  /** Refreshes the conversation list. */
  const loadSessions = useCallback(async () => {
    try {
      const { data } = await api.get("/chat/sessions");
      setSessions(data.data);
    } catch {
      setSessions([]);
    }
  }, []);

  /** Loads one session's exchanges into the transcript. */
  const openSession = useCallback(async (id) => {
    setRestoring(true);
    setSendError(null);
    setSessionId(id);
    rememberSessionId(id);
    try {
      const { data } = await api.get("/chat/history", {
        params: { sessionId: id },
      });
      setMessages(data.data.flatMap(toBubbles));
    } catch {
      setMessages([]);
    } finally {
      setRestoring(false);
    }
  }, []);

  // First load: metadata, the conversation list, and the active transcript, so
  // a reload resumes the conversation instead of appearing to lose it.
  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        const [metaRes, historyRes] = await Promise.all([
          api.get("/chat/meta"),
          api.get("/chat/history", { params: { sessionId } }),
        ]);
        if (cancelled) return;
        setMeta(metaRes.data.data);
        setMessages(historyRes.data.data.flatMap(toBubbles));
      } catch (err) {
        if (!cancelled) setLoadError(err.message);
      } finally {
        if (!cancelled) setRestoring(false);
      }
    };

    boot();
    loadSessions();
    return () => {
      cancelled = true;
    };
    // Intentionally once on mount: session switches go through openSession.
  }, [loadSessions, sessionId]);

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  const send = useCallback(
    async (question) => {
      const text = String(question ?? "").trim();
      if (!text || sending) return;

      const viaVoice = voiceSubmitRef.current;
      voiceSubmitRef.current = false;

      setSendError(null);
      setInput("");
      setSending(true);
      setMessages((current) => [
        ...current,
        { role: "user", text, viaVoice, key: `u-${Date.now()}` },
      ]);

      try {
        const { data } = await api.post("/chat", {
          question: text,
          sessionId,
          inputMode: viaVoice ? "voice" : "text",
        });
        setMessages((current) => [
          ...current,
          { role: "assistant", key: data.data.id, ...data.data },
        ]);
        loadSessions();
      } catch (err) {
        setSendError(err.message);
        // Put the question back so it isn't lost to a failed request.
        setInput(text);
        setMessages((current) => current.slice(0, -1));
      } finally {
        setSending(false);
      }
    },
    [sending, sessionId, loadSessions],
  );

  const startNewChat = () => {
    const id = newSessionId();
    setSessionId(id);
    rememberSessionId(id);
    setMessages([]);
    setSendError(null);
  };

  const deleteSession = async (id) => {
    try {
      await api.delete("/chat/history", { params: { sessionId: id } });
      await loadSessions();
      // Deleting the conversation you are reading leaves you in a fresh one.
      if (id === sessionId) startNewChat();
    } catch (err) {
      setSendError(err.message);
    }
  };

  const clearHistory = async () => {
    try {
      await api.delete("/chat/history");
      await loadSessions();
      startNewChat();
    } catch (err) {
      setSendError(err.message);
    }
  };

  if (loadError) {
    return (
      <div className="shell py-12">
        <ErrorState
          message={loadError}
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  if (!meta)
    return <Spinner label="Loading your coach" className="min-h-[60vh]" />;

  return (
    <div className="shell py-8 sm:py-12">
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        {/* ------------------------------------------------------ conversation */}
        <div className="flex min-h-[70vh] flex-col">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
            <div>
              <p className="eyebrow">AI coach · RAG</p>
              <h1 className="display-lg mt-1.5">Ask the coach</h1>
              <p className="mt-2 max-w-xl text-sm text-fog">
                Answers come only from {meta.knowledge.entries} curated entries
                — if it isn&apos;t in there, the coach says so rather than
                guessing.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowKnowledge((s) => !s)}
                className="lg:hidden"
              >
                <BookOpen size={15} aria-hidden="true" />
                Sources
              </Button>
              {messages.length > 0 && (
                <Button variant="outline" size="sm" onClick={startNewChat}>
                  <Plus size={15} aria-hidden="true" />
                  New chat
                </Button>
              )}
            </div>
          </header>

          {!meta.aiAvailable && (
            <div className="panel mt-4 flex gap-3 p-4 text-sm">
              <Info
                size={16}
                className="mt-0.5 shrink-0 text-fog-dim"
                aria-hidden="true"
              />
              <p className="text-fog">
                <span className="font-semibold text-chalk">
                  AI phrasing is offline.
                </span>{" "}
                Retrieval still works, so the coach will return the matching
                knowledge-base entry as written.
              </p>
            </div>
          )}

          {/* Messages */}
          <div className="min-h-0 flex-1 py-5">
            {restoring ? (
              <Spinner label="Restoring your conversation" />
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col justify-center">
                <div className="panel p-6 text-center sm:p-8">
                  <span
                    className="mx-auto grid size-12 place-items-center rounded-2xl bg-volt/10 text-volt"
                    aria-hidden="true"
                  >
                    <Sparkles size={22} />
                  </span>
                  <h2 className="display-md mt-4">What do you want to know?</h2>
                  <p className="mx-auto mt-2 max-w-md text-sm text-fog">
                    {meta.scope}
                  </p>

                  <ul className="mt-6 flex flex-wrap justify-center gap-2">
                    {meta.suggestions.map((s) => (
                      <li key={s}>
                        <button
                          type="button"
                          onClick={() => send(s)}
                          className="rounded-full border border-line px-3.5 py-2 text-xs font-semibold text-fog transition-colors hover:border-volt hover:text-volt"
                        >
                          {s}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <ul className="space-y-5">
                {messages.map((message) =>
                  message.role === "user" ? (
                    <UserBubble
                      key={message.key}
                      text={message.text}
                      viaVoice={message.viaVoice}
                    />
                  ) : (
                    <AssistantBubble
                      key={message.key}
                      message={{ ...message, onAsk: send }}
                    />
                  ),
                )}
                {sending && (
                  <li className="flex gap-3">
                    <span
                      className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-volt/15 text-volt"
                      aria-hidden="true"
                    >
                      <Bot size={15} />
                    </span>
                    <div className="rounded-2xl rounded-tl-md border border-line bg-panel px-4 py-3">
                      <span className="flex items-center gap-2 text-sm text-fog">
                        <span className="flex gap-1" aria-hidden="true">
                          <span className="size-1.5 animate-bounce rounded-full bg-volt [animation-delay:0ms]" />
                          <span className="size-1.5 animate-bounce rounded-full bg-volt [animation-delay:150ms]" />
                          <span className="size-1.5 animate-bounce rounded-full bg-volt [animation-delay:300ms]" />
                        </span>
                        Searching the knowledge base
                      </span>
                    </div>
                  </li>
                )}
                <li ref={listEndRef} aria-hidden="true" />
              </ul>
            )}
          </div>

          {/* Composer */}
          <div className="sticky bottom-4">
            {sendError && (
              <div
                role="alert"
                className="mb-2 flex items-start gap-2.5 rounded-xl border border-ember/30 bg-ember/8 p-3 text-sm text-ember"
              >
                <AlertTriangle
                  size={15}
                  className="mt-0.5 shrink-0"
                  aria-hidden="true"
                />
                <span>{sendError}</span>
              </div>
            )}

            {speech.error && (
              <div
                role="alert"
                className="mb-2 flex items-start gap-2.5 rounded-xl border border-line bg-panel p-3 text-xs text-fog"
              >
                <MicOff
                  size={14}
                  className="mt-0.5 shrink-0"
                  aria-hidden="true"
                />
                <span className="flex-1">{speech.error}</span>
                <button
                  type="button"
                  onClick={() => speech.setError(null)}
                  aria-label="Dismiss"
                  className="text-fog-dim hover:text-chalk"
                >
                  <X size={13} aria-hidden="true" />
                </button>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="panel flex items-end gap-2 p-2 shadow-2xl"
            >
              <label className="min-w-0 flex-1">
                <span className="sr-only-focusable">Your question</span>
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={
                    speech.listening ? speech.transcript || "Listening…" : input
                  }
                  onChange={(e) => setInput(e.target.value)}
                  readOnly={speech.listening}
                  onKeyDown={(e) => {
                    // Enter sends; Shift+Enter makes a new line.
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(input);
                    }
                  }}
                  placeholder="Ask about training, form, recovery or nutrition…"
                  maxLength={1000}
                  className="max-h-32 w-full resize-none bg-transparent px-3 py-2.5 text-sm placeholder:text-fog-dim focus:outline-none"
                />
              </label>

              {speech.supported && (
                <button
                  type="button"
                  onClick={speech.toggle}
                  aria-label={
                    speech.listening ? "Stop listening" : "Ask by voice"
                  }
                  aria-pressed={speech.listening}
                  className={cx(
                    "grid size-10 shrink-0 place-items-center rounded-xl border transition-colors",
                    speech.listening
                      ? "animate-pulse border-ember bg-ember/15 text-ember"
                      : "border-line text-fog-dim hover:border-volt hover:text-volt",
                  )}
                >
                  {speech.listening ? <MicOff size={17} /> : <Mic size={17} />}
                </button>
              )}

              <button
                type="submit"
                disabled={!input.trim() || sending}
                aria-label="Send"
                className="grid size-10 shrink-0 place-items-center rounded-xl bg-volt text-ink transition-all hover:bg-volt-deep disabled:opacity-40"
              >
                <Send size={17} aria-hidden="true" />
              </button>
            </form>

            <p
              aria-live="polite"
              className="mt-2 px-1 text-[0.625rem] text-fog-dim"
            >
              {speech.listening
                ? "Listening — speak now."
                : speech.supported
                  ? "Enter to send · Shift+Enter for a new line · mic for voice"
                  : "Enter to send · voice input is not supported in this browser"}
            </p>
          </div>
        </div>

        {/* --------------------------------------------------------- sidebar */}
        <div className={cx("lg:block", showKnowledge ? "block" : "hidden")}>
          <div className="lg:sticky lg:top-20 lg:space-y-4">
            <ConversationList
              sessions={sessions}
              activeId={sessionId}
              onOpen={(id) => {
                setShowKnowledge(false);
                openSession(id);
              }}
              onDelete={deleteSession}
              retentionDays={meta.retentionDays}
            />

            <KnowledgePanel
              onClose={() => setShowKnowledge(false)}
              onAsk={(q) => {
                setShowKnowledge(false);
                send(q);
              }}
            />

            <div className="panel p-4">
              <p className="eyebrow">Not medical advice</p>
              <p className="mt-2 text-xs leading-relaxed text-fog">
                The coach will not diagnose injuries or advise on medication,
                and will redirect you to a professional where that is the right
                answer.
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearHistory}
                className="mt-3 w-full"
              >
                <Trash2 size={14} aria-hidden="true" />
                Clear all history
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
