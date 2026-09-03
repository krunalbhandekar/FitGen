import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronDown,
  Download,
  Dumbbell,
  ExternalLink,
  HeartPulse,
  Info,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Timer,
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
import { humanise } from '../components/form';
import { PlanHistory } from '../components/PlanHistory';
import { exportWorkoutPlanPdf } from '../lib/pdf';
import { useAuth } from '../context/AuthContext';
import { usePdfExport } from '../hooks/usePdfExport';

/** Explains where a plan came from — central to the project's AI story. */
const ProvenanceBadge = ({ generation }) => {
  const map = {
    groq: { tone: 'volt', label: 'AI generated', icon: Sparkles },
    hybrid: { tone: 'neutral', label: 'AI + rule-based', icon: Sparkles },
    fallback: { tone: 'neutral', label: 'Rule-based', icon: ShieldCheck },
  };
  const entry = map[generation?.generatedBy] ?? map.fallback;
  const Icon = entry.icon;

  return (
    <Badge tone={entry.tone}>
      <Icon size={12} aria-hidden="true" />
      {entry.label}
    </Badge>
  );
};

const DayCard = ({ day, defaultOpen }) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <li className="panel overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-4 p-5 text-left transition-colors hover:bg-panel-2"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-volt/10 font-display text-lg text-volt">
          {day.dayIndex}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-bold">{day.name}</span>
            {day.isRecoveryDay && <Badge tone="ember">Recovery</Badge>}
          </span>
          <span className="mt-0.5 block truncate text-xs text-fog-dim">
            {day.isRecoveryDay
              ? 'No safe resistance work available'
              : `${day.exercises.length} exercises · ${day.focus.map(humanise).join(', ')}`}
          </span>
        </span>

        <ChevronDown
          size={18}
          aria-hidden="true"
          className={cx(
            'shrink-0 text-fog-dim transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div className="border-t border-line p-5">
          <p className="mb-4 text-sm text-fog">{day.description}</p>

          {day.exercises.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line p-4 text-sm text-fog-dim">
              Treat this as active recovery — walking, mobility work or physiotherapy.
            </p>
          ) : (
            <ol className="space-y-3">
              {day.exercises.map((exercise) => (
                <li
                  key={exercise.slug}
                  className="rounded-xl border border-line bg-panel-2 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-baseline gap-2">
                        <span className="font-display text-sm text-fog-dim">
                          {String(exercise.order).padStart(2, '0')}
                        </span>
                        <Link
                          to={`/exercises/${encodeURIComponent(exercise.slug)}`}
                          className="font-bold hover:text-volt"
                        >
                          {exercise.name}
                        </Link>
                      </p>
                      <p className="mt-1 text-xs text-fog-dim">
                        {humanise(exercise.primaryMuscles?.join(', ') ?? '')}
                        {exercise.equipment ? ` · ${humanise(exercise.equipment)}` : ''}
                        {exercise.mechanic ? ` · ${humanise(exercise.mechanic)}` : ''}
                      </p>
                    </div>

                    <Link
                      to={`/exercises/${encodeURIComponent(exercise.slug)}`}
                      aria-label={`View ${exercise.name}`}
                      className="shrink-0 text-fog-dim transition-colors hover:text-volt"
                    >
                      <ExternalLink size={15} aria-hidden="true" />
                    </Link>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-line pt-3 text-sm">
                    <span>
                      <span className="text-fog-dim">Sets </span>
                      <span className="font-bold tabular-nums">{exercise.sets}</span>
                    </span>
                    <span>
                      <span className="text-fog-dim">Reps </span>
                      <span className="font-bold tabular-nums">{exercise.reps}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Timer size={13} className="text-fog-dim" aria-hidden="true" />
                      <span className="font-bold tabular-nums">
                        {exercise.restSeconds}s
                      </span>
                    </span>
                  </div>

                  {exercise.note && (
                    <p className="mt-2.5 text-xs text-fog italic">{exercise.note}</p>
                  )}

                  {exercise.caution && (
                    <p className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-ember/8 p-2.5 text-xs text-ember">
                      <HeartPulse size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                      {exercise.caution}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </li>
  );
};

export const WorkoutPlanPage = () => {
  const { displayName } = useAuth();
  const pdf = usePdfExport();
  const [plan, setPlan] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [genError, setGenError] = useState(null);
  // Bumped after a successful generation so the history list refetches.
  const [historyKey, setHistoryKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [planRes, statusRes] = await Promise.all([
        api.get('/plans/workout'),
        api.get('/plans/status'),
      ]);
      setPlan(planRes.data.data);
      setStatus(statusRes.data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const generate = async () => {
    setGenerating(true);
    setGenError(null);
    try {
      const { data } = await api.post('/plans/workout/generate');
      setPlan({ ...data.data, stale: false });
      const statusRes = await api.get('/plans/status');
      setStatus(statusRes.data.data);
      setHistoryKey((k) => k + 1);
    } catch (err) {
      setGenError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return <Spinner label="Loading your plan" className="min-h-[60vh]" />;

  if (error) {
    return (
      <div className="shell py-12">
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }

  if (!status?.onboardingCompleted) {
    return (
      <div className="shell max-w-2xl py-16 text-center">
        <h1 className="display-lg">Set up your profile first</h1>
        <p className="mt-3 text-fog">
          Your split is built from your goal, equipment and injuries — so we need those
          before we can generate anything.
        </p>
        <Button as={Link} to="/onboarding" size="lg" className="mt-8">
          Start setup
        </Button>
      </div>
    );
  }

  return (
    <div className="shell space-y-6 py-8 sm:py-12">
      <PageHeader
        eyebrow="Training"
        title="Your workout split"
        description="Selected from the verified exercise library, filtered to your equipment and routed around your injuries."
        actions={
          <>
            {/*
             * Export is only offered once a plan exists — a button that can
             * only produce an empty document is worse than no button.
             */}
            {plan && (
              <Button
                variant="outline"
                loading={pdf.busy}
                onClick={() =>
                  pdf.run(() => exportWorkoutPlanPdf(plan, { userName: displayName }))
                }
              >
                <Download size={16} aria-hidden="true" />
                <span className="hidden sm:inline">Download</span> PDF
              </Button>
            )}
            <Button onClick={generate} loading={generating}>
              <RefreshCw size={16} aria-hidden="true" />
              {plan ? 'Regenerate' : 'Generate plan'}
            </Button>
          </>
        }
      />

      {pdf.error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-ember/30 bg-ember/8 p-3.5 text-sm text-ember"
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{pdf.error}</span>
        </div>
      )}

      {genError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-ember/30 bg-ember/8 p-3.5 text-sm text-ember"
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{genError}</span>
        </div>
      )}

      {!status.aiAvailable && (
        <div className="panel flex gap-3 p-4 text-sm">
          <Info size={16} className="mt-0.5 shrink-0 text-fog-dim" aria-hidden="true" />
          <p className="text-fog">
            <span className="font-semibold text-chalk">AI generation is offline.</span>{' '}
            No <code className="text-chalk">GROQ_API_KEY</code> is configured, so plans
            are built by the rule-based engine instead. They stay grounded in the same
            verified database.
          </p>
        </div>
      )}

      {generating && !plan && (
        <div className="panel p-8">
          <Spinner label="Building your week — selecting exercises and checking them against your injuries" />
        </div>
      )}

      {!plan && !generating ? (
        <EmptyState
          icon={Dumbbell}
          title="No plan yet"
          description="Generate your first split. It'll use your preferred split type, your training days, and only the equipment you have."
          action={
            <Button onClick={generate} loading={generating} size="lg">
              Generate plan
            </Button>
          }
        />
      ) : plan ? (
        <>
          {/* Plan meta */}
          <div className="panel p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <ProvenanceBadge generation={plan.generation} />
              <Badge tone="neutral">v{plan.version}</Badge>
              <Badge tone="neutral">{humanise(plan.splitType)}</Badge>
              <Badge tone="neutral">{plan.daysPerWeek} days/week</Badge>
              <Badge tone="neutral">{humanise(plan.goal)}</Badge>
              {plan.stale && <Badge tone="ember">Out of date</Badge>}
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-4">
              <div>
                <dt className="eyebrow">Prescribed volume</dt>
                <dd className="mt-1 font-semibold">
                  {plan.guidelines?.sets} × {plan.guidelines?.reps}
                </dd>
              </div>
              <div>
                <dt className="eyebrow">Rest</dt>
                <dd className="mt-1 font-semibold">
                  {plan.guidelines?.restSeconds}s
                </dd>
              </div>
              <div>
                <dt className="eyebrow">Model</dt>
                <dd className="mt-1 truncate text-sm font-semibold">
                  {plan.generation?.model ?? 'Rule-based'}
                </dd>
              </div>
              <div>
                <dt className="eyebrow">Built in</dt>
                <dd className="mt-1 font-semibold tabular-nums">
                  {(plan.generation?.durationMs / 1000).toFixed(1)}s
                </dd>
              </div>
            </dl>

            {plan.stale && (
              <div className="mt-5 flex flex-col gap-3 rounded-xl border border-ember/30 bg-ember/8 p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-ember">
                  Your profile has changed since this plan was built (profile v
                  {status.profileVersion} vs plan v{plan.profileVersion}).
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={generate}
                  loading={generating}
                  className="shrink-0"
                >
                  Rebuild
                </Button>
              </div>
            )}
          </div>

          {/* Injury safety report */}
          {plan.safetyNotes?.length > 0 && (
            <div className="panel p-5 sm:p-6">
              <h2 className="flex items-center gap-2 font-bold">
                <ShieldCheck size={16} className="text-volt" aria-hidden="true" />
                Injury filtering
              </h2>
              <ul className="mt-3 space-y-1.5">
                {plan.safetyNotes.map((note) => (
                  <li key={note} className="text-sm text-fog">
                    {note}
                  </li>
                ))}
              </ul>
              {plan.excludedForInjury?.length > 0 && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm text-fog-dim hover:text-chalk">
                    Show {plan.excludedForInjury.length} excluded exercise
                    {plan.excludedForInjury.length === 1 ? '' : 's'}
                  </summary>
                  <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                    {plan.excludedForInjury.map((entry) => (
                      <li key={entry.slug} className="text-xs text-fog-dim">
                        <span className="text-fog">{entry.name}</span> — {entry.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {/* Generation warnings — surfaced, not hidden */}
          {plan.generation?.warnings?.length > 0 && (
            <details className="panel p-5">
              <summary className="cursor-pointer text-sm font-semibold">
                Generation notes ({plan.generation.warnings.length})
              </summary>
              <ul className="mt-3 space-y-1.5">
                {plan.generation.warnings.map((warning) => (
                  <li key={warning} className="text-xs leading-relaxed text-fog">
                    {warning}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {/* The week */}
          <ul className="space-y-3">
            {plan.days.map((day, index) => (
              <DayCard key={day.dayIndex} day={day} defaultOpen={index === 0} />
            ))}
          </ul>

          <PlanHistory
            kind="workout"
            currentProfileVersion={status.profileVersion}
            refreshKey={historyKey}
          />
        </>
      ) : null}
    </div>
  );
};
