import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  ClipboardList,
  HeartPulse,
  Info,
  Minus,
  Plus,
  RotateCcw,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { api } from '../lib/api';
import {
  Badge,
  Button,
  cx,
  EmptyState,
  ErrorState,
  PageHeader,
  Spinner,
} from '../components/ui';
import { Field, NumberInput, Select, TextInput, humanise } from '../components/form';
import { SessionHistory } from '../components/SessionHistory';

/**
 * Session logger.
 *
 * Each exercise arrives pre-filled with the progression engine's suggestion, so
 * the common case is "confirm and save" rather than typing everything. The
 * suggestion is a starting value the user can overwrite — it is never imposed.
 */

/** How each recommendation is presented. */
const RECOMMENDATION_UI = {
  increase_load: { label: 'Add load', tone: 'volt', icon: ArrowUp },
  add_reps: { label: 'Add reps', tone: 'volt', icon: TrendingUp },
  hold: { label: 'Repeat', tone: 'neutral', icon: Minus },
  deload: { label: 'Deload', tone: 'ember', icon: ArrowDown },
  reset_stall: { label: 'Break plateau', tone: 'ember', icon: RotateCcw },
  insufficient_data: { label: 'First session', tone: 'neutral', icon: Info },
};

const today = () => new Date().toISOString().slice(0, 10);

/* ------------------------------------------------------------- set editor */

const SetRow = ({ set, index, onChange, onRemove, canRemove }) => (
  <div className="flex items-center gap-2">
    <span className="w-6 shrink-0 text-center font-display text-sm text-fog-dim">
      {index + 1}
    </span>

    <label className="flex-1">
      <span className="sr-only-focusable">Reps for set {index + 1}</span>
      <NumberInput
        value={set.reps}
        min={0}
        max={500}
        inputMode="numeric"
        placeholder="reps"
        unit="reps"
        onChange={(e) =>
          onChange({ ...set, reps: e.target.value === '' ? '' : Number(e.target.value) })
        }
      />
    </label>

    <label className="flex-1">
      <span className="sr-only-focusable">Weight for set {index + 1}</span>
      <NumberInput
        value={set.weightKg}
        min={0}
        max={700}
        step="0.5"
        inputMode="decimal"
        placeholder="weight"
        unit="kg"
        onChange={(e) =>
          onChange({
            ...set,
            weightKg: e.target.value === '' ? '' : Number(e.target.value),
          })
        }
      />
    </label>

    <button
      type="button"
      onClick={onRemove}
      disabled={!canRemove}
      aria-label={`Remove set ${index + 1}`}
      className="grid size-11 shrink-0 place-items-center rounded-xl border border-line text-fog-dim transition-colors hover:border-ember hover:text-ember disabled:opacity-30"
    >
      <Trash2 size={15} aria-hidden="true" />
    </button>
  </div>
);

/* -------------------------------------------------------- exercise block */

const ExerciseBlock = ({ exercise, entry, onChange }) => {
  const ui =
    RECOMMENDATION_UI[exercise.progression.recommendation] ??
    RECOMMENDATION_UI.insufficient_data;
  const Icon = ui.icon;

  const volume = entry.sets.reduce(
    (sum, s) => sum + (Number(s.reps) || 0) * (Number(s.weightKg) || 0),
    0,
  );

  const updateSet = (index, next) => {
    const sets = [...entry.sets];
    sets[index] = next;
    onChange({ ...entry, sets });
  };

  return (
    <li className={cx('panel p-5', entry.skipped && 'opacity-60')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to={`/exercises/${encodeURIComponent(exercise.slug)}`}
            className="font-bold hover:text-volt"
          >
            {exercise.name}
          </Link>
          <p className="mt-0.5 text-xs text-fog-dim">
            {humanise(exercise.primaryMuscles?.join(', ') ?? '')}
            {exercise.equipment ? ` · ${humanise(exercise.equipment)}` : ''}
            {' · target '}
            {exercise.plannedSets}×{exercise.plannedReps}
          </p>
        </div>

        <label className="flex shrink-0 items-center gap-2 text-xs text-fog">
          <input
            type="checkbox"
            checked={entry.skipped}
            onChange={(e) => onChange({ ...entry, skipped: e.target.checked })}
            className="size-4 accent-[var(--color-volt)]"
          />
          Skip
        </label>
      </div>

      {/* Progression guidance */}
      <div className="mt-4 flex gap-3 rounded-xl border border-line bg-panel-2 p-3.5">
        <span className="mt-0.5 shrink-0">
          <Badge tone={ui.tone}>
            <Icon size={11} aria-hidden="true" />
            {ui.label}
          </Badge>
        </span>
        <div className="min-w-0">
          <p className="text-xs leading-relaxed text-fog">
            {exercise.progression.reason}
          </p>
          {exercise.lastSession && (
            <p className="mt-1.5 text-[0.6875rem] text-fog-dim">
              Last time:{' '}
              {exercise.lastSession.sets
                .map((s) => `${s.reps}×${s.weightKg || 'BW'}`)
                .join(', ')}
            </p>
          )}
        </div>
      </div>

      {exercise.caution && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-ember/8 p-2.5 text-xs text-ember">
          <HeartPulse size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          {exercise.caution}
        </p>
      )}

      {!entry.skipped && (
        <>
          <div className="mt-4 space-y-2">
            {entry.sets.map((set, index) => (
              <SetRow
                key={index}
                set={set}
                index={index}
                canRemove={entry.sets.length > 1}
                onChange={(next) => updateSet(index, next)}
                onRemove={() =>
                  onChange({
                    ...entry,
                    sets: entry.sets.filter((_, i) => i !== index),
                  })
                }
              />
            ))}
          </div>

          <div className="mt-3 flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={entry.sets.length >= 20}
              onClick={() => {
                const last = entry.sets.at(-1);
                onChange({
                  ...entry,
                  sets: [
                    ...entry.sets,
                    {
                      setNumber: entry.sets.length + 1,
                      reps: last?.reps ?? '',
                      weightKg: last?.weightKg ?? '',
                    },
                  ],
                });
              }}
            >
              <Plus size={14} aria-hidden="true" />
              Add set
            </Button>
            <span className="text-xs text-fog-dim tabular-nums">
              {volume > 0 ? `${volume.toLocaleString('en-IN')} kg volume` : ''}
            </span>
          </div>
        </>
      )}
    </li>
  );
};

/* -------------------------------------------------------------------- page */

export const LogWorkoutPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const [dayIndex, setDayIndex] = useState(Number(params.get('day')) || 1);
  const [plan, setPlan] = useState(null);
  const [day, setDay] = useState(null);
  const [entries, setEntries] = useState({});
  const [date, setDate] = useState(today());
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saveError, setSaveError] = useState(null);

  /** Loads the plan day plus its progression suggestions. */
  const load = useCallback(async (index) => {
    setLoading(true);
    setError(null);
    try {
      const [planRes, progRes] = await Promise.all([
        api.get('/plans/workout'),
        api.get(`/logs/progression/${index}`),
      ]);

      setPlan(planRes.data.data);
      const data = progRes.data.data;
      setDay(data);

      // Seed the form from each exercise's suggestion.
      setEntries(
        Object.fromEntries(
          data.exercises.map((exercise) => {
            const suggested = exercise.progression.suggestedWeightKg;
            const setCount = exercise.plannedSets ?? 3;
            return [
              exercise.slug,
              {
                skipped: false,
                sets: Array.from({ length: setCount }, (_, i) => ({
                  setNumber: i + 1,
                  reps: '',
                  weightKg: suggested ?? '',
                })),
              },
            ];
          }),
        ),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(dayIndex);
  }, [load, dayIndex]);

  const totalVolume = useMemo(
    () =>
      Object.values(entries).reduce(
        (sum, entry) =>
          entry.skipped
            ? sum
            : sum +
              entry.sets.reduce(
                (s, set) => s + (Number(set.reps) || 0) * (Number(set.weightKg) || 0),
                0,
              ),
        0,
      ),
    [entries],
  );

  const loggedSetCount = useMemo(
    () =>
      Object.values(entries).reduce(
        (sum, entry) =>
          entry.skipped
            ? sum
            : sum + entry.sets.filter((s) => Number(s.reps) > 0).length,
        0,
      ),
    [entries],
  );

  const save = async () => {
    setSaving(true);
    setSaveError(null);

    const payload = {
      planId: plan?._id,
      planVersion: plan?.version,
      dayIndex: day.dayIndex,
      dayName: day.dayName,
      date,
      ...(duration ? { durationMinutes: Number(duration) } : {}),
      ...(notes ? { notes } : {}),
      exercises: day.exercises
        .map((exercise, index) => {
          const entry = entries[exercise.slug];
          if (!entry) return null;
          return {
            order: index + 1,
            slug: exercise.slug,
            targetSets: exercise.plannedSets,
            targetReps: exercise.plannedReps,
            ...(exercise.progression.suggestedWeightKg
              ? { prescribedWeightKg: exercise.progression.suggestedWeightKg }
              : {}),
            skipped: entry.skipped,
            // Drop blank rows; the server rejects a log with nothing in it.
            sets: entry.skipped
              ? []
              : entry.sets
                  .filter((s) => Number(s.reps) > 0)
                  .map((s, i) => ({
                    setNumber: i + 1,
                    reps: Number(s.reps),
                    weightKg: Number(s.weightKg) || 0,
                  })),
          };
        })
        .filter(Boolean),
    };

    try {
      await api.post('/logs/workout', payload);
      navigate('/progress?logged=1');
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner label="Loading your session" className="min-h-[60vh]" />;

  if (error) {
    return (
      <div className="shell py-12">
        <ErrorState message={error} onRetry={() => load(dayIndex)} />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="shell max-w-2xl py-16">
        <EmptyState
          icon={ClipboardList}
          title="No workout plan yet"
          description="Generate a plan first — logging works against the day you're training."
          action={
            <Button as={Link} to="/plan/workout" size="lg">
              Generate a plan
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="shell max-w-3xl space-y-5 py-8 sm:py-12">
      <PageHeader
        eyebrow="Log a session"
        title={day.dayName}
        description="Suggestions come from what you last lifted. Overwrite anything that doesn't match how the session actually went."
      />

      {/* Session meta */}
      <div className="panel grid gap-4 p-5 sm:grid-cols-3">
        <Field label="Training day" htmlFor="day">
          <Select
            id="day"
            value={dayIndex}
            onChange={(e) => setDayIndex(Number(e.target.value))}
            options={plan.days.map((d) => ({
              value: d.dayIndex,
              label: `${d.dayIndex}. ${d.name}`,
            }))}
          />
        </Field>
        <Field label="Date" htmlFor="date">
          <TextInput
            id="date"
            type="date"
            max={today()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Duration" htmlFor="duration">
          <NumberInput
            id="duration"
            unit="min"
            min={1}
            max={600}
            placeholder="Optional"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </Field>
      </div>

      {day.isRecoveryDay ? (
        <EmptyState
          icon={HeartPulse}
          title="Recovery day"
          description="Your injuries left no safe resistance work for this day, so there's nothing to log. Pick a different day above."
        />
      ) : (
        <>
          <ul className="space-y-4">
            {day.exercises.map((exercise) => (
              <ExerciseBlock
                key={exercise.slug}
                exercise={exercise}
                entry={entries[exercise.slug] ?? { skipped: false, sets: [] }}
                onChange={(next) =>
                  setEntries((current) => ({ ...current, [exercise.slug]: next }))
                }
              />
            ))}
          </ul>

          <Field label="Session notes" htmlFor="notes">
            <TextInput
              id="notes"
              maxLength={1000}
              placeholder="How did it feel? Anything to remember for next time?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>

          {saveError && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-ember/30 bg-ember/8 p-3.5 text-sm text-ember"
            >
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{saveError}</span>
            </div>
          )}

          {/* Sticky save bar — the session summary stays visible while scrolling */}
          <div className="sticky bottom-4 z-30">
            <div className="panel flex flex-wrap items-center gap-4 p-4 shadow-2xl">
              <div className="mr-auto">
                <p className="text-xs text-fog-dim">
                  {loggedSetCount} set{loggedSetCount === 1 ? '' : 's'} logged
                </p>
                <p className="font-display text-xl tabular-nums">
                  {totalVolume.toLocaleString('en-IN')}
                  <span className="ml-1 font-sans text-xs font-medium text-fog-dim">
                    kg volume
                  </span>
                </p>
              </div>
              <Button
                onClick={save}
                loading={saving}
                disabled={loggedSetCount === 0}
                size="lg"
              >
                <Check size={18} aria-hidden="true" />
                Save session
              </Button>
            </div>
            {loggedSetCount === 0 && (
              <p className="mt-2 text-center text-xs text-fog-dim">
                Enter reps on at least one set to save.
              </p>
            )}
          </div>
        </>
      )}

      {/*
       * Outside the recovery-day branch on purpose: "what did I log recently?"
       * is worth answering even on a day that has nothing to log.
       */}
      <SessionHistory />
    </div>
  );
};
