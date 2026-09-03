import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Apple,
  ArrowRight,
  Bot,
  ClipboardList,
  Dumbbell,
  RefreshCw,
  Salad,
  Settings,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { Badge, Button, ErrorState, PageHeader, Spinner, StatCard } from '../components/ui';
import { TargetsPanel } from '../components/TargetsPanel';
import { humanise } from '../components/form';

/** What each later phase adds here — labelled by phase, never faked. */
const ROADMAP = [
];

export const Dashboard = () => {
  const { user, firstName } = useAuth();
  const [profile, setProfile] = useState(null);
  const [planStatus, setPlanStatus] = useState(null);
  const [counts, setCounts] = useState({ exercises: null, foods: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileRes, statusRes, exerciseRes, foodRes] = await Promise.all([
        api.get('/profile'),
        api.get('/plans/status'),
        api.get('/exercises', { params: { limit: 1 } }),
        api.get('/foods', { params: { limit: 1 } }),
      ]);
      setProfile(profileRes.data.data);
      setPlanStatus(statusRes.data.data);
      setCounts({
        exercises: exerciseRes.data.pagination.total,
        foods: foodRes.data.meta.total,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Spinner label="Loading your dashboard" className="min-h-[60vh]" />;

  if (error) {
    return (
      <div className="shell py-12">
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }

  const onboarded = profile.onboardingCompleted;

  return (
    <div className="shell space-y-10 py-8 sm:py-12">
      <PageHeader
        eyebrow="Dashboard"
        title={`Let's go, ${firstName}`}
        description={
          onboarded
            ? 'Your targets are computed from your profile using published formulas.'
            : 'Set up your profile to unlock your calorie and macro targets.'
        }
        actions={
          onboarded ? (
            <Button as={Link} to="/profile" variant="outline">
              <Settings size={16} aria-hidden="true" />
              Edit profile
            </Button>
          ) : (
            <Button as={Link} to="/onboarding">
              Start setup
              <ArrowRight size={16} aria-hidden="true" />
            </Button>
          )
        }
      />

      {/* Setup prompt for users who haven't onboarded */}
      {!onboarded && (
        <section className="panel relative overflow-hidden p-6 sm:p-8">
          <div className="stripes absolute inset-x-0 top-0 h-1.5" aria-hidden="true" />
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-xl">
              <Badge tone="volt">Next up</Badge>
              <h2 className="display-md mt-3">Six steps to your numbers</h2>
              <p className="mt-2 text-sm text-fog">
                Body stats, goal, equipment, diet and injuries. Then FitGen computes
                your BMR, TDEE and macro split, and generates your workout and diet
                plans from them.
              </p>
              <div className="mt-4 flex items-center gap-3">
                <div className="h-1.5 w-32 overflow-hidden rounded-full bg-panel-2">
                  <div
                    className="h-full rounded-full bg-volt"
                    style={{ width: `${profile.completeness.percent}%` }}
                  />
                </div>
                <span className="text-xs text-fog-dim tabular-nums">
                  {profile.completeness.percent}% complete
                </span>
              </div>
            </div>
            <Button as={Link} to="/onboarding" size="lg" className="shrink-0">
              Start setup
              <ArrowRight size={18} aria-hidden="true" />
            </Button>
          </div>
        </section>
      )}

      {/* Regeneration notice */}
      {profile.planRegeneration.required && (
        <div className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <RefreshCw size={18} className="mt-0.5 shrink-0 text-volt" aria-hidden="true" />
            <div>
              <p className="font-bold">Profile changed</p>
              <p className="mt-0.5 text-sm text-fog">
                {profile.planRegeneration.reasons.map(humanise).join(', ')} changed
                since your last plan — regenerate to bring it up to date.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button as={Link} to="/plan/workout" variant="outline" size="sm">
              Workout
            </Button>
            <Button as={Link} to="/plan/diet" variant="outline" size="sm">
              Diet
            </Button>
          </div>
        </div>
      )}

      {/* Computed targets — the Phase 2 payoff */}
      {onboarded && (
        <section aria-labelledby="targets-heading">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Deterministic calculations</p>
              <h2 id="targets-heading" className="display-md mt-1.5">
                Your daily targets
              </h2>
            </div>
            <Badge tone="neutral">Profile v{profile.profileVersion}</Badge>
          </div>
          <TargetsPanel targets={profile.targets} />
        </section>
      )}

      {/* Generated plans */}
      {onboarded && (
        <section aria-labelledby="plans-heading">
          <div className="mb-4 border-b border-line pb-4">
            <p className="eyebrow">Train</p>
            <h2 id="plans-heading" className="display-md mt-1.5">
              Your plans &amp; progress
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                to: '/plan/workout',
                icon: Dumbbell,
                title: 'Workout split',
                plan: planStatus?.workout,
                summary: planStatus?.workout
                  ? `${humanise(planStatus.workout.splitType)} · ${planStatus.workout.daysPerWeek} days/week`
                  : 'Not generated yet',
              },
              {
                to: '/plan/diet',
                icon: Salad,
                title: 'Diet plan',
                plan: planStatus?.diet,
                summary: planStatus?.diet
                  ? `${planStatus.diet.dailyTotals?.calories ?? '—'} kcal/day`
                  : 'Not generated yet',
              },
              {
                to: '/log',
                icon: ClipboardList,
                title: 'Log a session',
                plan: null,
                summary: planStatus?.workout
                  ? 'Record what you actually lifted'
                  : 'Generate a plan first',
              },
              {
                to: '/progress',
                icon: TrendingUp,
                title: 'Progress',
                plan: null,
                summary: 'Charts, streaks and body metrics',
              },
              {
                to: '/coach',
                icon: Bot,
                title: 'Ask the coach',
                plan: null,
                summary: 'Grounded answers on training and nutrition',
              },
            ].map(({ to, icon: Icon, title, plan, summary }) => (
              <Link
                key={to}
                to={to}
                className="panel group flex items-center gap-4 p-5 transition-colors hover:border-volt/50"
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-volt/10 text-volt">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-bold transition-colors group-hover:text-volt">
                      {title}
                    </span>
                    {plan ? (
                      plan.stale ? (
                        <Badge tone="ember">Out of date</Badge>
                      ) : (
                        <Badge tone="volt">v{plan.version}</Badge>
                      )
                    ) : (
                      <Badge tone="neutral">New</Badge>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-fog">
                    {summary}
                  </span>
                </span>
                <ArrowRight
                  size={18}
                  aria-hidden="true"
                  className="shrink-0 text-fog-dim transition-transform group-hover:translate-x-0.5 group-hover:text-volt"
                />
              </Link>
            ))}
          </div>

          {planStatus && !planStatus.aiAvailable && (
            <p className="mt-3 text-xs text-fog-dim">
              AI generation is offline (no GROQ_API_KEY) — plans use the rule-based
              engine, grounded in the same verified database.
            </p>
          )}
        </section>
      )}

      {/* Library status */}
      <section aria-label="Library status" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Dumbbell}
          label="Exercises available"
          value={counts.exercises ?? '—'}
          hint="Verified library"
        />
        <StatCard
          icon={Apple}
          label="Foods with macros"
          value={counts.foods ?? '—'}
          hint="Curated database"
        />
        <StatCard
          icon={Sparkles}
          label="Profile setup"
          value={onboarded ? 'Complete' : `${profile.completeness.percent}%`}
          hint={onboarded ? 'Targets computed' : 'Finish the wizard'}
        />
        <StatCard
          icon={Settings}
          label="Account role"
          value={user.role === 'admin' ? 'Admin' : 'Member'}
          hint={user.role === 'admin' ? 'Full database access' : 'Standard access'}
        />
      </section>

      {/* Roadmap */}
      <section aria-labelledby="roadmap-heading">
        <div className="border-b border-line pb-4">
          <p className="eyebrow">Coming next</p>
          <h2 id="roadmap-heading" className="display-md mt-1.5">
            On the roadmap
          </h2>
        </div>

        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ROADMAP.map(({ icon: Icon, phase, title, body }) => (
            <li key={title} className="panel p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-panel-2 text-fog">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <Badge>{phase}</Badge>
              </div>
              <h3 className="mt-4 font-bold">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-fog">{body}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};
