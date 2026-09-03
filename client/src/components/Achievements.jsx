import { useCallback, useEffect, useState } from 'react';
import { Award, Flame, Lock, Target, TrendingUp } from 'lucide-react';
import { api } from '../lib/api';
import { Badge, cx, Spinner } from './ui';

/**
 * Consistency score and badges.
 *
 * Everything shown here is derived from the user's own logs on each request —
 * nothing is stored — so a deleted or backdated log is reflected immediately
 * rather than leaving a badge stranded. See `gamification.js` for why.
 */

const TIER_STYLE = {
  bronze: { ring: 'border-amber-700/40', text: 'text-amber-600', label: 'Bronze' },
  silver: { ring: 'border-slate-400/40', text: 'text-slate-300', label: 'Silver' },
  gold: { ring: 'border-volt/50', text: 'text-volt', label: 'Gold' },
};

const COMPONENT_LABELS = {
  adherence: 'Training as planned',
  recency: 'Trained recently',
  streak: 'Week streak',
  logging: 'Recording check-ins',
};

/* --------------------------------------------------------- consistency ring */

/**
 * Score dial.
 *
 * A single hero number with a progress arc — the form the dataviz guidance
 * calls for when one figure is the whole message, rather than a chart.
 */
const ScoreDial = ({ score, band }) => {
  const RADIUS = 42;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const filled = (score / 100) * CIRCUMFERENCE;

  return (
    <div className="relative grid size-28 shrink-0 place-items-center">
      <svg
        viewBox="0 0 100 100"
        className="absolute size-full -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          stroke="var(--color-panel-2)"
          strokeWidth="8"
        />
        <circle
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          stroke="var(--color-volt)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
        />
      </svg>
      <div className="text-center">
        <p className="font-display text-3xl leading-none tabular-nums">{score}</p>
        <p className="mt-0.5 text-[0.5625rem] tracking-wider text-fog-dim uppercase">
          {band}
        </p>
      </div>
    </div>
  );
};

/* ----------------------------------------------------------------- badge */

const BadgeCard = ({ badge }) => {
  const tier = TIER_STYLE[badge.tier] ?? TIER_STYLE.bronze;

  return (
    <li
      className={cx(
        'rounded-xl border p-4 transition-colors',
        badge.earned ? cx('bg-panel-2', tier.ring) : 'border-line bg-panel opacity-70',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={cx(
            'grid size-9 shrink-0 place-items-center rounded-lg',
            badge.earned ? cx('bg-ink', tier.text) : 'bg-panel-2 text-fog-dim',
          )}
          aria-hidden="true"
        >
          {badge.earned ? <Award size={17} /> : <Lock size={15} />}
        </span>
        <Badge tone={badge.earned && badge.tier === 'gold' ? 'volt' : 'neutral'}>
          {tier.label}
        </Badge>
      </div>

      <p className={cx('mt-3 font-bold', !badge.earned && 'text-fog')}>{badge.name}</p>
      <p className="mt-1 text-xs leading-relaxed text-fog-dim">{badge.description}</p>

      {!badge.earned && badge.progress.target > 1 && (
        <div className="mt-3">
          <div className="h-1 overflow-hidden rounded-full bg-panel-2">
            <div
              className="h-full rounded-full bg-volt/60"
              style={{ width: `${badge.progress.percent}%` }}
            />
          </div>
          <p className="mt-1.5 text-[0.625rem] text-fog-dim tabular-nums">
            {badge.progress.current.toLocaleString('en-IN')} /{' '}
            {badge.progress.target.toLocaleString('en-IN')}
          </p>
        </div>
      )}
    </li>
  );
};

/* ------------------------------------------------------------------- panel */

export const Achievements = ({ refreshKey }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [showLocked, setShowLocked] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: res } = await api.get('/logs/achievements');
      setData(res.data);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (error) return null; // Gamification is decorative; never block the page.
  if (!data) return <Spinner label="Loading achievements" />;

  const { score, badges, summary, nextUp, consistency } = data;
  const visible = showLocked ? badges : badges.filter((b) => b.earned);

  return (
    <div className="space-y-4">
      {/* Consistency score */}
      <section className="panel p-5 sm:p-6" aria-labelledby="score-heading">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <ScoreDial score={score.score} band={score.band} />

          <div className="min-w-0 flex-1">
            <p className="eyebrow">Consistency score</p>
            <h3 id="score-heading" className="display-md mt-1.5">
              {score.band === 'no data' ? 'Nothing logged yet' : `You're ${score.band}`}
            </h3>
            <p className="mt-2 text-sm text-fog">
              Weighted across four things that actually indicate adherence — how
              often you train against plan, how recently, your week streak, and
              whether you record check-ins.
            </p>

            <dl className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {Object.entries(score.components).map(([key, component]) => (
                <div key={key}>
                  <div className="flex items-baseline justify-between gap-2">
                    <dt
                      className={cx(
                        'text-xs',
                        score.weakest === key ? 'font-semibold text-chalk' : 'text-fog',
                      )}
                    >
                      {COMPONENT_LABELS[key] ?? key}
                    </dt>
                    <dd className="text-xs text-fog-dim tabular-nums">
                      {component.value}
                      <span className="opacity-60"> / 100</span>
                    </dd>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-panel-2">
                    <div
                      className={cx(
                        'h-full rounded-full',
                        score.weakest === key ? 'bg-ember' : 'bg-volt',
                      )}
                      style={{ width: `${component.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </dl>

            {score.weakest && (
              <p className="mt-3 flex items-start gap-1.5 text-xs text-fog-dim">
                <Target size={12} className="mt-0.5 shrink-0 text-ember" aria-hidden="true" />
                Biggest gain available:{' '}
                <span className="text-fog">
                  {(COMPONENT_LABELS[score.weakest] ?? score.weakest).toLowerCase()}
                </span>
              </p>
            )}
          </div>
        </div>

        {/* Streak strip */}
        <div className="mt-6 grid grid-cols-3 gap-4 border-t border-line pt-5">
          <div>
            <p className="eyebrow flex items-center gap-1">
              <Flame size={11} aria-hidden="true" />
              Week streak
            </p>
            <p className="mt-1 font-display text-2xl tabular-nums">
              {consistency.streakWeeks}
            </p>
          </div>
          <div>
            <p className="eyebrow">This week</p>
            <p className="mt-1 font-display text-2xl tabular-nums">
              {consistency.sessionsThisWeek}
              <span className="ml-0.5 font-sans text-xs font-medium text-fog-dim">
                / {consistency.trainingDaysPerWeek}
              </span>
            </p>
          </div>
          <div>
            <p className="eyebrow flex items-center gap-1">
              <TrendingUp size={11} aria-hidden="true" />
              Adherence
            </p>
            <p className="mt-1 font-display text-2xl tabular-nums">
              {consistency.adherencePercent}
              <span className="ml-0.5 font-sans text-xs font-medium text-fog-dim">%</span>
            </p>
          </div>
        </div>
      </section>

      {/* Badges */}
      <section className="panel p-5 sm:p-6" aria-labelledby="badges-heading">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Badges</p>
            <h3 id="badges-heading" className="display-md mt-1.5">
              {summary.earned} of {summary.total} earned
            </h3>
            <p className="mt-1 flex flex-wrap gap-2 text-xs text-fog-dim">
              {Object.entries(summary.byTier).map(([tier, counts]) => (
                <span key={tier} className={TIER_STYLE[tier]?.text}>
                  {TIER_STYLE[tier]?.label}: {counts.earned}/{counts.total}
                </span>
              ))}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowLocked((s) => !s)}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-fog transition-colors hover:border-volt hover:text-volt"
          >
            {showLocked ? 'Earned only' : 'Show all'}
          </button>
        </div>

        {nextUp && !nextUp.earned && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-line bg-panel-2 p-3.5">
            <Target size={15} className="mt-0.5 shrink-0 text-volt" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">Closest badge: {nextUp.name}</p>
              <p className="mt-0.5 text-xs text-fog">
                {nextUp.description} — {nextUp.progress.percent}% there.
              </p>
            </div>
          </div>
        )}

        {visible.length === 0 ? (
          <p className="mt-5 rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-fog-dim">
            No badges yet. Log a session to earn your first.
          </p>
        ) : (
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((badge) => (
              <BadgeCard key={badge.id} badge={badge} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
