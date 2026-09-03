import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ClipboardList,
  History,
  Trash2,
} from 'lucide-react';
import { api } from '../lib/api';
import { Badge, Button, cx, ErrorState, Spinner } from './ui';

/**
 * Previously logged sessions.
 *
 * Sits under the logging form because that is where a mistake becomes visible:
 * the two questions this answers — "did I already log today?" and "what did I
 * actually put in yesterday?" — both arise while looking at the form.
 *
 * Deletion matters more than it looks. Every figure on the progress dashboard
 * is derived from these documents, and Phase 6 added badges and a consistency
 * score on top. A mistyped 600 kg bench press becomes a permanent personal
 * record and permanently awards "beat a previous best", so without a way to
 * remove a bad entry the derived numbers are wrong forever.
 *
 * Sets are shown as `reps × weight`, the notation used on the form itself, so
 * a value can be compared against what was entered without translation.
 */

const PAGE_SIZE = 10;

const fmtDate = (value) =>
  new Date(value).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const nf = new Intl.NumberFormat('en-IN');

/** `8×60, 8×60, 7×57.5` — bodyweight sets read as BW, matching the form. */
const describeSets = (sets = []) =>
  sets.map((set) => `${set.reps}×${set.weightKg || 'BW'}`).join(', ');

/* ------------------------------------------------------------------- a row */

const SessionRow = ({ log, onDeleted }) => {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  const performed = log.exercises.filter((exercise) => !exercise.skipped);
  const skipped = log.exercises.filter((exercise) => exercise.skipped);

  const remove = async () => {
    setDeleting(true);
    setError(null);
    try {
      await api.delete(`/logs/workout/${log._id}`);
      onDeleted(log);
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  };

  return (
    <li className="border-b border-line last:border-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 py-3.5 text-left transition-colors hover:bg-panel-2"
      >
        <ChevronDown
          size={15}
          aria-hidden="true"
          className={cx(
            'shrink-0 text-fog-dim transition-transform',
            open && 'rotate-180',
          )}
        />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {log.dayName ?? `Day ${log.dayIndex ?? '—'}`}
          </p>
          <p className="mt-0.5 text-xs text-fog-dim">
            {fmtDate(log.date)}
            {log.durationMinutes ? ` · ${log.durationMinutes} min` : ''}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold text-volt tabular-nums">
            {nf.format(log.totalVolumeKg ?? 0)}
            <span className="ml-0.5 text-[0.625rem] font-medium text-fog-dim">kg</span>
          </p>
          <p className="text-[0.625rem] text-fog-dim tabular-nums">
            {performed.length} exercise{performed.length === 1 ? '' : 's'} ·{' '}
            {log.totalSets ?? 0} sets
          </p>
        </div>
      </button>

      {open && (
        <div className="pb-4 pl-6">
          {performed.length === 0 ? (
            <p className="text-xs text-fog-dim">
              Every exercise was skipped in this session.
            </p>
          ) : (
            <ul className="space-y-2">
              {performed.map((exercise) => (
                <li
                  key={exercise.slug}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
                >
                  <span className="min-w-0 flex-1 text-xs font-medium">
                    {exercise.name}
                  </span>
                  <span className="text-xs text-fog tabular-nums">
                    {describeSets(exercise.sets)}
                  </span>
                  {/*
                   * The prescription is snapshotted on the log, so this stays
                   * meaningful after the plan is regenerated.
                   */}
                  {exercise.targetReps && (
                    <span className="text-[0.625rem] text-fog-dim">
                      target {exercise.targetSets}×{exercise.targetReps}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {skipped.length > 0 && (
            <p className="mt-2.5 text-[0.6875rem] text-fog-dim">
              Skipped: {skipped.map((exercise) => exercise.name).join(', ')}
            </p>
          )}

          {log.notes && (
            <p className="mt-3 rounded-lg bg-panel-2 p-2.5 text-xs leading-relaxed text-fog">
              {log.notes}
            </p>
          )}

          {error && (
            <p role="alert" className="mt-3 text-xs text-ember">
              {error}
            </p>
          )}

          <div className="mt-3.5">
            {confirming ? (
              <div className="rounded-xl border border-ember/30 bg-ember/8 p-3">
                <p className="flex items-start gap-2 text-xs text-ember">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>
                    Deleting this session removes it from your volume charts,
                    consistency score, personal records and badges. This can't be
                    undone.
                  </span>
                </p>
                <div className="mt-3 flex gap-2">
                  <Button variant="danger" size="sm" loading={deleting} onClick={remove}>
                    Delete session
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirming(false)}
                    disabled={deleting}
                  >
                    Keep it
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="inline-flex items-center gap-1.5 text-xs text-fog-dim transition-colors hover:text-ember"
              >
                <Trash2 size={13} aria-hidden="true" />
                Delete this session
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
};

/* ------------------------------------------------------------------ panel */

export const SessionHistory = ({ refreshKey }) => {
  const [logs, setLogs] = useState(null);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [error, setError] = useState(null);
  const [flash, setFlash] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await api.get('/logs/workout', { params: { limit } });
      setLogs(data.data);
      setTotal(data.meta?.total ?? data.data.length);
    } catch (err) {
      setError(err.message);
    }
  }, [limit]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const afterDelete = (log) => {
    setFlash(`Deleted the session from ${fmtDate(log.date)}.`);
    load();
  };

  if (error) {
    return (
      <section className="panel p-5">
        <ErrorState message={error} onRetry={load} />
      </section>
    );
  }

  if (!logs) return <Spinner label="Loading your sessions" />;

  return (
    <section className="panel p-5 sm:p-6" aria-labelledby="history-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="eyebrow flex items-center gap-1.5">
            <History size={12} aria-hidden="true" />
            History
          </p>
          <h2 id="history-heading" className="display-md mt-1.5">
            Previous sessions
          </h2>
        </div>
        {total > 0 && (
          <Badge>
            {total} logged
          </Badge>
        )}
      </div>

      {flash && (
        <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-line bg-panel-2 p-3">
          <Check size={14} className="shrink-0 text-volt" aria-hidden="true" />
          <p className="text-xs text-fog">{flash}</p>
        </div>
      )}

      {logs.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-line px-4 py-10 text-center">
          <ClipboardList
            size={24}
            className="mx-auto text-fog-dim"
            aria-hidden="true"
          />
          <p className="mt-3 text-sm text-fog">Nothing logged yet.</p>
          <p className="mt-1 text-xs text-fog-dim">
            Save the session above and it will appear here.
          </p>
        </div>
      ) : (
        <>
          <p className="mt-2 text-sm text-fog">
            Tap a session to see the sets you recorded. Useful for checking
            whether today is already logged, or fixing an entry that went in
            wrong.
          </p>

          <ul className="mt-4">
            {logs.map((log) => (
              <SessionRow key={log._id} log={log} onDeleted={afterDelete} />
            ))}
          </ul>

          {logs.length < total && (
            <div className="mt-4 text-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLimit((current) => current + PAGE_SIZE)}
              >
                Show {Math.min(PAGE_SIZE, total - logs.length)} more
              </Button>
              <p className="mt-2 text-xs text-fog-dim">
                Showing {logs.length} of {total}
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
};
