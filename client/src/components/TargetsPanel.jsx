import { Flame, Info, Target, TrendingDown, TrendingUp, Zap } from 'lucide-react';
import { Badge, cx } from './ui';

/**
 * Fixed categorical order — protein, carbs, fats. Never cycled or reordered,
 * so a macro keeps its colour everywhere in the app.
 */
export const MACRO_SERIES = [
  { key: 'protein', label: 'Protein', color: 'var(--color-macro-protein)', kcalPerG: 4 },
  { key: 'carbs', label: 'Carbs', color: 'var(--color-macro-carbs)', kcalPerG: 4 },
  { key: 'fats', label: 'Fats', color: 'var(--color-macro-fats)', kcalPerG: 9 },
];

const nf = new Intl.NumberFormat('en-IN');

/* ------------------------------------------------------------- Macro bar */

/**
 * Part-to-whole bar: each macro's share of total calories.
 *
 * A stacked bar (not a pie) because the parts are being compared to each other
 * as well as to the whole, and because it stays readable at phone width.
 * Segments carry a 2px surface gap and their own labels below, so the encoding
 * never relies on colour alone.
 */
export const MacroBar = ({ macros, height = 10, showLabels = true }) => {
  const series = MACRO_SERIES.map((s) => ({
    ...s,
    grams: macros?.[s.key] ?? 0,
    kcal: (macros?.[s.key] ?? 0) * s.kcalPerG,
  }));

  const totalKcal = series.reduce((sum, s) => sum + s.kcal, 0);
  if (totalKcal <= 0) return null;

  return (
    <div>
      <div
        className="flex w-full gap-0.5 overflow-hidden rounded-full"
        style={{ height }}
        role="img"
        aria-label={series
          .map(
            (s) =>
              `${s.label} ${s.grams}g, ${Math.round((s.kcal / totalKcal) * 100)}% of calories`,
          )
          .join('; ')}
      >
        {series.map((s) => (
          <span
            key={s.key}
            className="first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${(s.kcal / totalKcal) * 100}%`,
              backgroundColor: s.color,
            }}
          />
        ))}
      </div>

      {showLabels && (
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {series.map((s) => (
            <li key={s.key} className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="truncate text-xs font-semibold text-fog">
                  {s.label}
                </span>
              </span>
              <p className="mt-1 font-bold tabular-nums">
                {nf.format(s.grams)}
                <span className="ml-0.5 text-xs font-medium text-fog-dim">g</span>
              </p>
              <p className="text-xs text-fog-dim tabular-nums">
                {Math.round((s.kcal / totalKcal) * 100)}% of kcal
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/* -------------------------------------------------------------- Stat cell */

const Stat = ({ icon: Icon, label, value, unit, hint }) => (
  <div className="min-w-0">
    <p className="eyebrow flex items-center gap-1.5">
      {Icon && <Icon size={12} aria-hidden="true" />}
      {label}
    </p>
    <p className="mt-1.5 font-display text-2xl leading-none tabular-nums sm:text-3xl">
      {value}
      {unit && (
        <span className="ml-1 text-xs font-sans font-medium text-fog-dim">{unit}</span>
      )}
    </p>
    {hint && <p className="mt-1 text-xs text-fog-dim">{hint}</p>}
  </div>
);

/* ---------------------------------------------------------- TargetsPanel */

/**
 * The deterministic-calculation showcase: BMR → TDEE → goal-adjusted calories
 * → macro split. Every figure here comes from a published formula, and the
 * chain is shown explicitly so a reader can follow how one produced the next.
 */
export const TargetsPanel = ({ targets, compact = false }) => {
  if (!targets?.complete) {
    return (
      <div className="panel p-6 text-center">
        <p className="text-sm text-fog">
          Complete your profile to see your calorie and macro targets.
        </p>
        {targets?.missing?.length > 0 && (
          <p className="mt-2 text-xs text-fog-dim">
            Still needed: {targets.missing.join(', ')}
          </p>
        )}
      </div>
    );
  }

  const { bmr, tdee, calories, macros, bmi, projection, assumptions } = targets;
  const gaining = projection.weeklyWeightChangeKg > 0;
  const holding = Math.abs(projection.weeklyWeightChangeKg) < 0.01;

  return (
    <div className="space-y-4">
      {/* Hero: the one number that matters most */}
      <div className="panel relative overflow-hidden p-6 sm:p-8">
        <div className="stripes absolute inset-x-0 top-0 h-1.5" aria-hidden="true" />

        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Daily calorie target</p>
            <p className="display-xl mt-1 text-volt tabular-nums">
              {nf.format(calories)}
            </p>
            <p className="mt-1 text-sm text-fog">
              kcal/day · {macros.caloriesFromMacros !== calories && 'macros total '}
              {nf.format(macros.caloriesFromMacros)} kcal from macros
            </p>
          </div>

          {!holding && (
            <Badge tone={gaining ? 'volt' : 'ember'}>
              {gaining ? (
                <TrendingUp size={12} aria-hidden="true" />
              ) : (
                <TrendingDown size={12} aria-hidden="true" />
              )}
              {gaining ? '+' : ''}
              {projection.weeklyWeightChangeKg} kg/week
            </Badge>
          )}
        </div>

        {/* The derivation chain, left to right */}
        <dl
          className={cx(
            'mt-8 grid gap-5 border-t border-line pt-6',
            compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4',
          )}
        >
          <Stat
            icon={Flame}
            label="BMR"
            value={nf.format(bmr)}
            unit="kcal"
            hint="Mifflin-St Jeor"
          />
          <Stat
            icon={Zap}
            label="TDEE"
            value={nf.format(tdee)}
            unit="kcal"
            hint={`×${targets.activityMultiplier} activity`}
          />
          <Stat
            icon={Target}
            label="Goal shift"
            value={`${targets.goalAdjustmentPercent > 0 ? '+' : ''}${targets.goalAdjustmentPercent}`}
            unit="%"
            hint={`${projection.dailyDeltaKcal > 0 ? '+' : ''}${nf.format(projection.dailyDeltaKcal)} kcal/day`}
          />
          <Stat
            label="BMI"
            value={bmi.value}
            hint={bmi.category}
          />
        </dl>
      </div>

      {/* Macro split */}
      <div className="panel p-6 sm:p-8">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="eyebrow">Macro split</p>
            <h3 className="display-md mt-1.5">Daily targets</h3>
          </div>
          <p className="shrink-0 text-right text-xs text-fog-dim">
            {macros.proteinPerKg} g protein
            <br />
            per kg bodyweight
          </p>
        </div>

        <div className="mt-6">
          <MacroBar macros={macros} height={12} />
        </div>
      </div>

      {/* Secondary figures */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="panel p-5">
          <Stat
            label="Water target"
            value={(targets.hydrationMl / 1000).toFixed(1)}
            unit="L"
            hint="≈35 ml per kg bodyweight"
          />
        </div>
        <div className="panel p-5">
          <Stat
            label="Est. time to target"
            value={projection.weeksToTarget ?? '—'}
            unit={projection.weeksToTarget ? 'weeks' : ''}
            hint={
              projection.weeksToTarget
                ? 'At the current calorie delta'
                : 'Set a target weight to project this'
            }
          />
        </div>
      </div>

      {/* Honest disclosure of any compromise the formulas made */}
      {assumptions?.length > 0 && (
        <div className="panel flex gap-3 p-5">
          <Info size={16} className="mt-0.5 shrink-0 text-fog-dim" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">How these were calculated</p>
            <ul className="mt-2 space-y-1.5">
              {assumptions.map((note) => (
                <li key={note} className="text-xs leading-relaxed text-fog">
                  {note}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
