import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cx } from './ui';

/**
 * Shared chart kit.
 *
 * COLOUR POLICY — established by running the palette validator against the dark
 * panel surface, not by eye:
 *
 * - The 2-slot pair below passes every check on ALL pairs, so it is safe
 *   wherever two series are compared freely (the lean/fat composition area).
 * - The 3-slot macro palette in index.css passes only on ADJACENT pairs; green
 *   and orange collapse under deuteranopia (ΔE 2.5). That is acceptable for a
 *   stacked bar whose segments are adjacent and directly labelled, and it is
 *   why no multi-line chart here uses three hues.
 * - Larger sets could not be made colourblind-safe inside the dark lightness
 *   band, so multi-metric views are FACETED into single-series small multiples
 *   instead of stacking hues. Measurements also differ in magnitude (waist
 *   ~86 cm vs arm ~36 cm), so one shared axis would misread anyway.
 */
export const CHART = {
  /** Single-series accent. */
  primary: '#739c18',
  /** Two-series pair — validated on all pairs. */
  pair: ['#4a90e2', '#e85f30'],
  grid: '#24282f',
  axis: '#6b707a',
  surface: '#101216',
};

const axisProps = {
  stroke: CHART.axis,
  tick: { fill: CHART.axis, fontSize: 11 },
  tickLine: false,
  axisLine: false,
};

/** Compact date label: charts get "12 Sep", not a full ISO string. */
const shortDate = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

/* ---------------------------------------------------------------- tooltip */

const ChartTooltip = ({ active, payload, label, unit, labelFormatter }) => {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-xl border border-line-bright bg-ink/95 px-3 py-2 shadow-xl backdrop-blur">
      <p className="text-xs font-semibold text-chalk">
        {labelFormatter ? labelFormatter(label) : shortDate(label)}
      </p>
      <ul className="mt-1.5 space-y-1">
        {payload
          .filter((entry) => entry.value != null)
          .map((entry) => (
            <li key={entry.dataKey} className="flex items-center gap-2 text-xs">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-fog">{entry.name}</span>
              <span className="ml-auto font-semibold text-chalk tabular-nums">
                {typeof entry.value === 'number'
                  ? Number(entry.value.toFixed(1)).toLocaleString('en-IN')
                  : entry.value}
                {entry.unit ?? unit ?? ''}
              </span>
            </li>
          ))}
      </ul>
    </div>
  );
};

/* -------------------------------------------------------------- container */

/**
 * Card wrapper. Charts scroll inside their own container on narrow screens
 * rather than forcing the page to scroll sideways.
 */
export const ChartCard = ({ title, subtitle, action, empty, children, className }) => (
  <section className={cx('panel p-5 sm:p-6', className)}>
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h3 className="font-bold">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-fog-dim">{subtitle}</p>}
      </div>
      {action}
    </div>

    {empty ? (
      <p className="mt-6 rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-fog-dim">
        {empty}
      </p>
    ) : (
      <div className="mt-5 -mx-1 overflow-x-auto px-1">{children}</div>
    )}
  </section>
);

/** Legend, rendered whenever two or more series share a plot. */
export const ChartLegend = ({ series }) => (
  <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
    {series.map((s) => (
      <li key={s.name} className="flex items-center gap-1.5 text-xs text-fog">
        <span
          aria-hidden="true"
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: s.color }}
        />
        {s.name}
      </li>
    ))}
  </ul>
);

/* ------------------------------------------------------------ MetricLine */

/**
 * Single-series trend line. No legend — the card title names the series, which
 * is the rule for a one-series plot.
 */
export const MetricLine = ({
  data,
  dataKey,
  name,
  unit = '',
  height = 220,
  color = CHART.primary,
  domain = ['auto', 'auto'],
}) => {
  const points = data.filter((d) => d[dataKey] != null);

  return (
    <ResponsiveContainer width="100%" height={height} minWidth={280}>
      <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDate} {...axisProps} />
        <YAxis domain={domain} width={44} {...axisProps} />
        <Tooltip
          content={<ChartTooltip unit={unit} />}
          cursor={{ stroke: CHART.axis, strokeDasharray: '3 3' }}
        />
        <Line
          type="monotone"
          dataKey={dataKey}
          name={name}
          stroke={color}
          strokeWidth={2}
          unit={unit}
          // >=8px markers, per the marks spec; hidden when the series is dense.
          dot={points.length <= 30 ? { r: 4, fill: color, strokeWidth: 0 } : false}
          activeDot={{ r: 5, fill: color, stroke: CHART.surface, strokeWidth: 2 }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

/* -------------------------------------------------- CompositionArea (2 series) */

/**
 * Lean vs fat mass over time — a genuine part-to-whole, since the two sum to
 * bodyweight. Uses the all-pairs-validated two-colour pair.
 */
export const CompositionArea = ({ data, height = 240 }) => {
  const points = data.filter((d) => d.leanMassKg != null && d.fatMassKg != null);
  const series = [
    { name: 'Lean mass', color: CHART.pair[0] },
    { name: 'Fat mass', color: CHART.pair[1] },
  ];

  return (
    <>
      <ResponsiveContainer width="100%" height={height} minWidth={280}>
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} {...axisProps} />
          <YAxis width={44} {...axisProps} />
          <Tooltip
            content={<ChartTooltip unit="kg" />}
            cursor={{ stroke: CHART.axis, strokeDasharray: '3 3' }}
          />
          <Area
            type="monotone"
            dataKey="leanMassKg"
            name="Lean mass"
            stackId="mass"
            stroke={CHART.pair[0]}
            strokeWidth={2}
            fill={CHART.pair[0]}
            fillOpacity={0.25}
            unit="kg"
          />
          <Area
            type="monotone"
            dataKey="fatMassKg"
            name="Fat mass"
            stackId="mass"
            stroke={CHART.pair[1]}
            strokeWidth={2}
            fill={CHART.pair[1]}
            fillOpacity={0.25}
            unit="kg"
          />
        </AreaChart>
      </ResponsiveContainer>
      <ChartLegend series={series} />
    </>
  );
};

/* ------------------------------------------------------------ VolumeBars */

/** Weekly training volume. Single series, so no legend. */
export const VolumeBars = ({ data, height = 220 }) => (
  <ResponsiveContainer width="100%" height={height} minWidth={280}>
    <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
      <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey="weekStart" tickFormatter={shortDate} {...axisProps} />
      <YAxis
        width={52}
        tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
        {...axisProps}
      />
      <Tooltip
        content={
          <ChartTooltip
            unit=" kg"
            labelFormatter={(v) => `Week of ${shortDate(v)}`}
          />
        }
        cursor={{ fill: '#ffffff08' }}
      />
      <Bar
        dataKey="volumeKg"
        name="Volume"
        fill={CHART.primary}
        // 4px rounded data-end, anchored to the baseline.
        radius={[4, 4, 0, 0]}
        maxBarSize={38}
        unit=" kg"
      />
    </BarChart>
  </ResponsiveContainer>
);

/* ------------------------------------------------------- ConsistencyBars */

/**
 * Sessions per week against the planned frequency. The target is a reference
 * line rather than a second series — it is a threshold, not data to compare.
 */
export const ConsistencyBars = ({ data, target, height = 200 }) => (
  <ResponsiveContainer width="100%" height={height} minWidth={280}>
    <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
      <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey="weekStart" tickFormatter={shortDate} {...axisProps} />
      <YAxis width={36} allowDecimals={false} {...axisProps} />
      <Tooltip
        content={
          <ChartTooltip labelFormatter={(v) => `Week of ${shortDate(v)}`} />
        }
        cursor={{ fill: '#ffffff08' }}
      />
      {target > 0 && (
        <ReferenceLine
          y={target}
          stroke={CHART.axis}
          strokeDasharray="4 4"
          label={{
            value: `target ${target}`,
            position: 'insideTopRight',
            fill: CHART.axis,
            fontSize: 10,
          }}
        />
      )}
      <Bar
        dataKey="sessions"
        name="Sessions"
        fill={CHART.primary}
        radius={[4, 4, 0, 0]}
        maxBarSize={34}
      />
    </BarChart>
  </ResponsiveContainer>
);

/* -------------------------------------------------------------- Sparkline */

/**
 * Small multiple for one measurement. Faceting rather than stacking hues is
 * deliberate — see the colour policy at the top of this file.
 */
export const MeasurementSparkline = ({ data, dataKey, label, unit = 'cm' }) => {
  const points = data.filter((d) => d[dataKey] != null);
  if (points.length < 2) return null;

  const first = points[0][dataKey];
  const last = points.at(-1)[dataKey];
  const change = Number((last - first).toFixed(1));

  return (
    <div className="rounded-xl border border-line bg-panel-2 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="eyebrow">{label}</p>
        <p
          className={cx(
            'text-xs font-semibold tabular-nums',
            change === 0 ? 'text-fog-dim' : change > 0 ? 'text-volt' : 'text-ember',
          )}
        >
          {change > 0 ? '+' : ''}
          {change} {unit}
        </p>
      </div>
      <p className="mt-1 font-display text-2xl tabular-nums">
        {last}
        <span className="ml-1 font-sans text-xs font-medium text-fog-dim">{unit}</span>
      </p>

      <div className="mt-2">
        <ResponsiveContainer width="100%" height={44}>
          <LineChart data={points} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
            <Tooltip content={<ChartTooltip unit={` ${unit}`} />} />
            <Line
              type="monotone"
              dataKey={dataKey}
              name={label}
              stroke={CHART.primary}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: CHART.primary }}
              unit={` ${unit}`}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------- data table */

/**
 * Accessible fallback for every chart: the same numbers as a table, so the
 * information is never colour- or vision-dependent.
 */
export const ChartDataTable = ({ columns, rows, caption }) => (
  <details className="mt-4">
    <summary className="cursor-pointer text-xs text-fog-dim hover:text-chalk">
      View as table
    </summary>
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-left text-xs">
        {caption && <caption className="sr-only-focusable">{caption}</caption>}
        <thead>
          <tr className="border-b border-line">
            {columns.map((c) => (
              <th key={c.key} scope="col" className="py-2 pr-4 font-semibold text-fog">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-line/50">
              {columns.map((c) => (
                <td key={c.key} className="py-1.5 pr-4 tabular-nums">
                  {c.format ? c.format(row[c.key]) : (row[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </details>
);
