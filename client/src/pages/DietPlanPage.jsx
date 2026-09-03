import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Download,
  Info,
  RefreshCw,
  Salad,
  ShieldCheck,
  ShoppingCart,
  Shuffle,
  Sparkles,
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
import { MACRO_SERIES, MacroBar } from '../components/TargetsPanel';
import { humanise } from '../components/form';
import { PlanHistory } from '../components/PlanHistory';
import { GroceryList } from '../components/GroceryList';
import { exportDietPlanPdf } from '../lib/pdf';
import { useAuth } from '../context/AuthContext';
import { usePdfExport } from '../hooks/usePdfExport';

const nf = new Intl.NumberFormat('en-IN');

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

/** Signed variance against target — green when close, amber when drifting. */
const VarianceChip = ({ label, value, unit, tolerance }) => {
  const within = Math.abs(value) <= tolerance;
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p
        className={cx(
          'mt-1 font-bold tabular-nums',
          within ? 'text-volt' : 'text-ember',
        )}
      >
        {value > 0 ? '+' : ''}
        {value}
        <span className="ml-0.5 text-xs font-medium text-fog-dim">{unit}</span>
      </p>
    </div>
  );
};

const MealCard = ({ meal, onSwap, swapping }) => (
  <li className="panel p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="eyebrow">Meal {meal.order}</p>
        <h3 className="display-md mt-1">{meal.name}</h3>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="font-display text-2xl leading-none text-volt tabular-nums">
            {nf.format(meal.totals?.calories ?? 0)}
          </p>
          <p className="text-[0.625rem] tracking-wide text-fog-dim uppercase">
            kcal{meal.targetCalories ? ` / ${nf.format(meal.targetCalories)} target` : ''}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onSwap(meal.order)}
          loading={swapping === meal.order}
          aria-label={`Swap ${meal.name}`}
        >
          <Shuffle size={14} aria-hidden="true" />
          Swap
        </Button>
      </div>
    </div>

    <div className="mt-5">
      <MacroBar macros={meal.totals} height={8} showLabels={false} />
    </div>

    <ul className="mt-4 divide-y divide-line">
      {meal.items.map((item) => (
        <li key={item.slug} className="flex items-baseline justify-between gap-4 py-2.5">
          <div className="min-w-0">
            <p className="truncate font-semibold">{item.name}</p>
            <p className="text-xs text-fog-dim">
              {item.grams}
              {item.unit}
              {item.servingLabel ? ` · ${item.servingLabel}` : ''}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold tabular-nums">
              {nf.format(item.calories)}
              <span className="ml-0.5 text-xs font-normal text-fog-dim">kcal</span>
            </p>
            <p className="text-xs text-fog-dim tabular-nums">
              P{item.protein} · C{item.carbs} · F{item.fats}
            </p>
          </div>
        </li>
      ))}
    </ul>

    <dl className="mt-4 grid grid-cols-4 gap-2 border-t border-line pt-4">
      {MACRO_SERIES.map((series) => (
        <div key={series.key}>
          <dt className="eyebrow flex items-center gap-1">
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: series.color }}
            />
            {series.label}
          </dt>
          <dd className="mt-0.5 font-bold tabular-nums">
            {meal.totals?.[series.key] ?? 0}
            <span className="ml-0.5 text-xs font-medium text-fog-dim">g</span>
          </dd>
        </div>
      ))}
      <div>
        <dt className="eyebrow">Fiber</dt>
        <dd className="mt-0.5 font-bold tabular-nums">
          {meal.totals?.fiber ?? 0}
          <span className="ml-0.5 text-xs font-medium text-fog-dim">g</span>
        </dd>
      </div>
    </dl>
  </li>
);

export const DietPlanPage = () => {
  const { displayName } = useAuth();
  const pdf = usePdfExport();
  const [plan, setPlan] = useState(null);
  const [showGroceries, setShowGroceries] = useState(false);
  /*
   * Bumped whenever the plan's contents change, so an open grocery list
   * refetches. Separate from `historyKey`: a meal swap edits the plan in place
   * without creating a new version, so it must refresh the list but must NOT
   * appear as a new entry in plan history.
   */
  const [groceryKey, setGroceryKey] = useState(0);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [swapping, setSwapping] = useState(null);
  const [error, setError] = useState(null);
  const [genError, setGenError] = useState(null);
  // Bumped after a successful generation so the history list refetches.
  const [historyKey, setHistoryKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [planRes, statusRes] = await Promise.all([
        api.get('/plans/diet'),
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
      const { data } = await api.post('/plans/diet/generate');
      setPlan({ ...data.data, stale: false });
      const statusRes = await api.get('/plans/status');
      setStatus(statusRes.data.data);
      setHistoryKey((k) => k + 1);
      setGroceryKey((k) => k + 1);
    } catch (err) {
      setGenError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const swap = async (order) => {
    setSwapping(order);
    setGenError(null);
    try {
      const { data } = await api.post(`/plans/diet/meals/${order}/swap`);
      setPlan((current) => ({ ...data.data, stale: current?.stale ?? false }));
      setGroceryKey((k) => k + 1);
    } catch (err) {
      setGenError(err.message);
    } finally {
      setSwapping(null);
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
          Meals are matched to your macro targets, diet type and allergies — we need
          those before generating anything.
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
        eyebrow="Nutrition"
        title="Your diet plan"
        description="Foods chosen by AI from the verified database; every macro recomputed by the server and portions scaled to your targets."
        actions={
          <>
            {/* Both only make sense against an existing plan. */}
            {plan && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setShowGroceries((open) => !open)}
                  aria-expanded={showGroceries}
                >
                  <ShoppingCart size={16} aria-hidden="true" />
                  {showGroceries ? 'Hide' : 'Grocery'} list
                </Button>
                <Button
                  variant="outline"
                  loading={pdf.busy}
                  onClick={() =>
                    pdf.run(() => exportDietPlanPdf(plan, { userName: displayName }))
                  }
                >
                  <Download size={16} aria-hidden="true" />
                  <span className="hidden sm:inline">Download</span> PDF
                </Button>
              </>
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
            No <code className="text-chalk">GROQ_API_KEY</code> is configured, so meals
            come from the rule-based builder. Macros are computed identically either way.
          </p>
        </div>
      )}

      {generating && !plan && (
        <div className="panel p-8">
          <Spinner label="Composing your meals and scaling portions to your macros" />
        </div>
      )}

      {!plan && !generating ? (
        <EmptyState
          icon={Salad}
          title="No diet plan yet"
          description="Generate a day of meals matched to your calorie and macro targets, respecting your diet type and allergies."
          action={
            <Button onClick={generate} loading={generating} size="lg">
              Generate plan
            </Button>
          }
        />
      ) : plan ? (
        <>
          {/* Totals vs targets */}
          <div className="panel p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <ProvenanceBadge generation={plan.generation} />
              <Badge tone="neutral">v{plan.version}</Badge>
              <Badge tone="neutral">{plan.meals.length} meals</Badge>
              {plan.stale && <Badge tone="ember">Out of date</Badge>}
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div>
                <p className="eyebrow">Daily total</p>
                <p className="display-lg mt-1 text-volt tabular-nums">
                  {nf.format(plan.dailyTotals.calories)}
                </p>
                <p className="mt-1 text-sm text-fog">
                  against a {nf.format(plan.targets.calories)} kcal target
                </p>
                <div className="mt-5">
                  <MacroBar macros={plan.dailyTotals} height={12} />
                </div>
              </div>

              <div>
                <p className="eyebrow mb-3">Variance from target</p>
                <dl className="grid grid-cols-2 gap-4 rounded-xl border border-line bg-panel-2 p-4">
                  <VarianceChip
                    label="Calories"
                    value={plan.variance.calories}
                    unit="kcal"
                    tolerance={plan.targets.calories * 0.08}
                  />
                  <VarianceChip
                    label="Protein"
                    value={plan.variance.protein}
                    unit="g"
                    tolerance={20}
                  />
                  <VarianceChip
                    label="Carbs"
                    value={plan.variance.carbs}
                    unit="g"
                    tolerance={35}
                  />
                  <VarianceChip
                    label="Fats"
                    value={plan.variance.fats}
                    unit="g"
                    tolerance={15}
                  />
                </dl>
                <p className="mt-3 text-xs text-fog-dim">
                  Whole foods can&apos;t hit a macro target exactly. Anything within a
                  few percent is well inside day-to-day variation.
                </p>
              </div>
            </div>

            {plan.stale && (
              <div className="mt-5 flex flex-col gap-3 rounded-xl border border-ember/30 bg-ember/8 p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-ember">
                  Your profile changed since this plan was built (profile v
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

          {/* Exclusions */}
          {plan.excludedFoods?.length > 0 && (
            <details className="panel p-5">
              <summary className="cursor-pointer text-sm font-semibold">
                <ShieldCheck
                  size={14}
                  className="mr-1.5 inline text-volt"
                  aria-hidden="true"
                />
                {plan.excludedFoods.length} food
                {plan.excludedFoods.length === 1 ? '' : 's'} excluded for your diet and
                allergies
              </summary>
              <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {plan.excludedFoods.map((entry) => (
                  <li key={entry.slug} className="text-xs text-fog-dim">
                    <span className="text-fog">{entry.name}</span> — {entry.reason}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-fog-dim">
                Chosen from {plan.candidatePoolSize} eligible foods.
              </p>
            </details>
          )}

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

          {showGroceries && (
            <GroceryList
              userName={displayName}
              refreshKey={groceryKey}
              onClose={() => setShowGroceries(false)}
            />
          )}

          {/* Meals */}
          <ul className="space-y-4">
            {plan.meals.map((meal) => (
              <MealCard
                key={meal.order}
                meal={meal}
                onSwap={swap}
                swapping={swapping}
              />
            ))}
          </ul>

          <PlanHistory
            kind="diet"
            currentProfileVersion={status.profileVersion}
            refreshKey={historyKey}
          />

          <p className="text-xs text-fog-dim">
            {humanise(plan.generation?.generatedBy ?? 'rule-based')} composition ·
            portions scaled deterministically · macros recomputed from the food
            database, never taken from the model.
          </p>
        </>
      ) : null}
    </div>
  );
};
