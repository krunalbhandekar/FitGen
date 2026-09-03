import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, History, Loader2, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { Badge, cx } from './ui';
import { humanise } from './form';

/**
 * Read-only list of previously generated plan versions.
 *
 * This exists mainly to make the project's "adaptive system" claim visible:
 * plans are versioned rather than overwritten, and each records the profile
 * version that produced it. There is deliberately no "restore" action —
 * reinstating a plan built for an outdated profile would be a footgun, and
 * regenerating is always the correct move.
 */

const nf = new Intl.NumberFormat('en-IN');

const formatDate = (value) =>
  new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const PROVENANCE = {
  groq: { label: 'AI', tone: 'volt' },
  hybrid: { label: 'AI + rules', tone: 'neutral' },
  fallback: { label: 'Rule-based', tone: 'neutral' },
};

/** One-line summary, shaped by plan type. */
const summarise = (kind, plan) => {
  if (kind === 'workout') {
    return `${humanise(plan.splitType ?? '')} · ${plan.daysPerWeek} days/week · ${humanise(plan.goal ?? '')}`;
  }
  const t = plan.dailyTotals ?? {};
  return `${nf.format(t.calories ?? 0)} kcal · P${t.protein ?? 0} / C${t.carbs ?? 0} / F${t.fats ?? 0}`;
};

/* --------------------------------------------------------- expanded detail */

const WorkoutDetail = ({ plan }) => (
  <ul className="space-y-3">
    {plan.days.map((day) => (
      <li key={day.dayIndex}>
        <p className="text-sm font-semibold">
          {day.dayIndex}. {day.name}
          <span className="ml-2 font-normal text-fog-dim">
            {day.exercises.length} exercise{day.exercises.length === 1 ? '' : 's'}
          </span>
        </p>
        {day.exercises.length > 0 && (
          <p className="mt-1 text-xs leading-relaxed text-fog">
            {day.exercises
              .map((e) => `${e.name} ${e.sets}×${e.reps}`)
              .join(' · ')}
          </p>
        )}
      </li>
    ))}
  </ul>
);

const DietDetail = ({ plan }) => (
  <ul className="space-y-3">
    {plan.meals.map((meal) => (
      <li key={meal.order}>
        <p className="text-sm font-semibold">
          {meal.name}
          <span className="ml-2 font-normal text-fog-dim tabular-nums">
            {nf.format(meal.totals?.calories ?? 0)} kcal
          </span>
        </p>
        <p className="mt-1 text-xs leading-relaxed text-fog">
          {meal.items.map((i) => `${i.name} ${i.grams}${i.unit}`).join(' · ')}
        </p>
      </li>
    ))}
  </ul>
);

/* ------------------------------------------------------------------- row */

const HistoryRow = ({ kind, plan, currentProfileVersion }) => {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const provenance = PROVENANCE[plan.generation?.generatedBy] ?? PROVENANCE.fallback;
  const stale = plan.profileVersion !== currentProfileVersion;

  const toggle = async () => {
    const next = !open;
    setOpen(next);

    // Fetch the full plan only on first expand.
    if (next && !detail && !loading) {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.get(`/plans/${kind}/${plan._id}`);
        setDetail(data.data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <li className={cx('rounded-xl border', plan.isActive ? 'border-volt/40' : 'border-line')}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-panel-2"
      >
        <span
          className={cx(
            'grid size-9 shrink-0 place-items-center rounded-lg font-display text-sm',
            plan.isActive ? 'bg-volt text-ink' : 'bg-panel-2 text-fog',
          )}
        >
          v{plan.version}
        </span>

        <span className={cx('min-w-0 flex-1', !plan.isActive && 'opacity-70')}>
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{formatDate(plan.createdAt)}</span>
            {plan.isActive && <Badge tone="volt">Active</Badge>}
            <Badge tone={provenance.tone}>
              {provenance.label === 'AI' && (
                <Sparkles size={11} aria-hidden="true" />
              )}
              {provenance.label}
            </Badge>
            <span className="text-[0.6875rem] text-fog-dim">
              built from profile v{plan.profileVersion}
              {stale ? ' (since changed)' : ''}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-fog">
            {summarise(kind, plan)}
          </span>
        </span>

        <ChevronDown
          size={16}
          aria-hidden="true"
          className={cx('shrink-0 text-fog-dim transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="border-t border-line p-4">
          {loading ? (
            <span className="flex items-center gap-2 text-sm text-fog">
              <Loader2 size={14} className="animate-spin text-volt" aria-hidden="true" />
              Loading version {plan.version}…
            </span>
          ) : error ? (
            <p role="alert" className="text-sm text-ember">
              {error}
            </p>
          ) : detail ? (
            kind === 'workout' ? (
              <WorkoutDetail plan={detail} />
            ) : (
              <DietDetail plan={detail} />
            )
          ) : null}
        </div>
      )}
    </li>
  );
};

/* ------------------------------------------------------------------ list */

export const PlanHistory = ({ kind, currentProfileVersion, refreshKey }) => {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/plans/${kind}/history`);
      setPlans(data.data);
    } catch {
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // A single version isn't a history worth showing.
  if (loading || plans.length <= 1) return null;

  return (
    <section className="panel p-5 sm:p-6" aria-labelledby={`${kind}-history`}>
      <h2 id={`${kind}-history`} className="flex items-center gap-2 font-bold">
        <History size={16} className="text-fog-dim" aria-hidden="true" />
        Previous versions
        <span className="text-sm font-normal text-fog-dim">({plans.length})</span>
      </h2>
      <p className="mt-1.5 text-xs text-fog-dim">
        Plans are versioned, never overwritten. Each records the profile version it
        was built from.
      </p>

      <ul className="mt-4 space-y-2">
        {plans.map((plan) => (
          <HistoryRow
            key={plan._id}
            kind={kind}
            plan={plan}
            currentProfileVersion={currentProfileVersion}
          />
        ))}
      </ul>
    </section>
  );
};
