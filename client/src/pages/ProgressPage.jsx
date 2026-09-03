import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Check,
  ClipboardList,
  Dumbbell,
  Flame,
  Info,
  Plus,
  Ruler,
  Scale,
  Trophy,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import {
  Button,
  cx,
  EmptyState,
  ErrorState,
  PageHeader,
  Spinner,
  StatCard,
} from '../components/ui';
import { Field, NumberInput, TextInput } from '../components/form';
import {
  ChartCard,
  ChartDataTable,
  CompositionArea,
  ConsistencyBars,
  MeasurementSparkline,
  MetricLine,
  VolumeBars,
} from '../components/charts';
import { Achievements } from '../components/Achievements';

const today = () => new Date().toISOString().slice(0, 10);
const nf = new Intl.NumberFormat('en-IN');

const fmtDate = (v) =>
  v
    ? new Date(v).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';

/** Signed change with the right colour for the direction the user wants. */
const ChangeChip = ({ value, unit, goodDirection = 'down' }) => {
  if (value == null) return null;
  const neutral = value === 0;
  const good = goodDirection === 'down' ? value < 0 : value > 0;

  return (
    <span
      className={cx(
        'text-xs font-semibold tabular-nums',
        neutral ? 'text-fog-dim' : good ? 'text-volt' : 'text-ember',
      )}
    >
      {value > 0 ? '+' : ''}
      {value}
      {unit}
    </span>
  );
};

/* --------------------------------------------------------- check-in form */

const CheckInForm = ({ onSaved, onCancel, canEstimateBodyFat }) => {
  const [form, setForm] = useState({
    date: today(),
    weightKg: '',
    neckCm: '',
    waistCm: '',
    hipCm: '',
    chestCm: '',
    armCm: '',
    thighCm: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async () => {
    setSaving(true);
    setError(null);
    setFieldErrors({});

    const measurements = Object.fromEntries(
      ['neckCm', 'waistCm', 'hipCm', 'chestCm', 'armCm', 'thighCm']
        .filter((k) => form[k] !== '')
        .map((k) => [k, Number(form[k])]),
    );

    try {
      const { data } = await api.post('/logs/progress', {
        date: form.date,
        ...(form.weightKg !== '' ? { weightKg: Number(form.weightKg) } : {}),
        measurements,
      });
      onSaved(data);
    } catch (err) {
      setError(err.message);
      if (err.details && typeof err.details === 'object') setFieldErrors(err.details);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-bold">New check-in</h2>
          <p className="mt-0.5 text-xs text-fog-dim">
            Record weight, measurements, or both. One check-in per day — saving
            again for the same date updates it.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close"
          className="grid size-9 shrink-0 place-items-center rounded-lg border border-line text-fog-dim hover:text-chalk"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Date" htmlFor="ci-date" error={fieldErrors.date}>
          <TextInput
            id="ci-date"
            type="date"
            max={today()}
            value={form.date}
            onChange={set('date')}
            error={fieldErrors.date}
          />
        </Field>
        <Field label="Weight" htmlFor="ci-weight" error={fieldErrors.weightKg}>
          <NumberInput
            id="ci-weight"
            unit="kg"
            step="0.1"
            placeholder="e.g. 82.5"
            value={form.weightKg}
            onChange={set('weightKg')}
            error={fieldErrors.weightKg}
          />
        </Field>
      </div>

      <div className="mt-6">
        <p className="eyebrow flex items-center gap-1.5">
          <Ruler size={12} aria-hidden="true" />
          Measurements
        </p>
        <p className="mt-1.5 text-xs text-fog-dim">
          Neck and waist unlock the Navy-method body-fat estimate
          {canEstimateBodyFat ? '' : ' (your profile also needs height and sex)'}.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {[
            ['neckCm', 'Neck'],
            ['waistCm', 'Waist'],
            ['hipCm', 'Hip'],
            ['chestCm', 'Chest'],
            ['armCm', 'Arm'],
            ['thighCm', 'Thigh'],
          ].map(([key, label]) => (
            <Field key={key} label={label} htmlFor={`ci-${key}`} error={fieldErrors[`measurements.${key}`]}>
              <NumberInput
                id={`ci-${key}`}
                unit="cm"
                step="0.5"
                value={form[key]}
                onChange={set(key)}
                error={fieldErrors[`measurements.${key}`]}
              />
            </Field>
          ))}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-5 flex items-start gap-2.5 rounded-xl border border-ember/30 bg-ember/8 p-3.5 text-sm text-ember"
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-6 flex gap-3 border-t border-line pt-5">
        <Button onClick={submit} loading={saving}>
          <Check size={16} aria-hidden="true" />
          Save check-in
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </section>
  );
};

/* -------------------------------------------------------------------- page */

export const ProgressPage = () => {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [flash, setFlash] = useState(
    params.get('logged') ? 'Session saved — your progression updates from here.' : null,
  );
  // Bumped after a check-in so the derived score and badges re-fetch.
  const [achievementsKey, setAchievementsKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res } = await api.get('/logs/dashboard');
      setData(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Clear the one-shot query flag so a refresh doesn't repeat the message.
  useEffect(() => {
    if (params.get('logged')) {
      const next = new URLSearchParams(params);
      next.delete('logged');
      setParams(next, { replace: true });
    }
  }, [params, setParams]);

  if (loading) return <Spinner label="Loading your progress" className="min-h-[60vh]" />;

  if (error) {
    return (
      <div className="shell py-12">
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }

  const { bodySeries, volumeByWeek, consistency, personalRecords, totals, current, change } =
    data;

  const hasWeight = bodySeries.some((p) => p.weightKg != null);
  const hasBodyFat = bodySeries.some((p) => p.bodyFatPercent != null);
  const hasComposition = bodySeries.some((p) => p.leanMassKg != null);
  const hasVolume = volumeByWeek.some((w) => w.volumeKg > 0);

  return (
    <div className="shell space-y-6 py-8 sm:py-12">
      <PageHeader
        eyebrow="Progress"
        title="Your progress"
        description="Body metrics, training volume and consistency over time. Every figure is computed from what you logged."
        actions={
          <div className="flex gap-2">
            <Button as={Link} to="/log" variant="outline">
              <ClipboardList size={16} aria-hidden="true" />
              Log a session
            </Button>
            <Button onClick={() => setShowForm(true)}>
              <Plus size={16} aria-hidden="true" />
              Check in
            </Button>
          </div>
        }
      />

      {flash && (
        <div className="panel flex items-center gap-3 p-4">
          <Check size={16} className="shrink-0 text-volt" aria-hidden="true" />
          <p className="text-sm text-fog">{flash}</p>
          <button
            type="button"
            onClick={() => setFlash(null)}
            aria-label="Dismiss"
            className="ml-auto text-fog-dim hover:text-chalk"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      )}

      {showForm && (
        <CheckInForm
          canEstimateBodyFat={data.bodyFatInputsAvailable}
          onCancel={() => setShowForm(false)}
          onSaved={(response) => {
            setShowForm(false);
            setFlash(
              response.bodyFatNote
                ? `Check-in saved. ${response.bodyFatNote}`
                : 'Check-in saved.',
            );
            setAchievementsKey((key) => key + 1);
            load();
          }}
        />
      )}

      {!data.hasData ? (
        <EmptyState
          icon={Activity}
          title="Nothing logged yet"
          description="Log a training session or record a check-in, and your charts will start building from there."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Button as={Link} to="/log">
                Log a session
              </Button>
              <Button variant="outline" onClick={() => setShowForm(true)}>
                Record a check-in
              </Button>
            </div>
          }
        />
      ) : (
        <>
          {/* Headline figures */}
          <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={Scale}
              label="Current weight"
              value={current.weightKg ?? '—'}
              hint={
                change.weightKg != null
                  ? `${change.weightKg > 0 ? '+' : ''}${change.weightKg} kg since ${fmtDate(change.sinceDate)}`
                  : 'Log a second check-in to see change'
              }
            />
            <StatCard
              icon={Activity}
              label="Body fat"
              value={current.bodyFatPercent != null ? `${current.bodyFatPercent}%` : '—'}
              hint={
                current.bodyFatCategory
                  ? `Navy method · ${current.bodyFatCategory}`
                  : 'Needs neck + waist measurements'
              }
            />
            <StatCard
              icon={Flame}
              label="Week streak"
              value={consistency.streakWeeks}
              hint={`${consistency.sessionsThisWeek}/${consistency.trainingDaysPerWeek} sessions this week`}
            />
            <StatCard
              icon={Dumbbell}
              label="Total volume"
              value={
                totals.totalVolumeKg >= 1000
                  ? `${Math.round(totals.totalVolumeKg / 1000)}t`
                  : totals.totalVolumeKg
              }
              hint={`${totals.workoutsLogged} sessions · ${nf.format(totals.totalSets)} sets`}
            />
          </section>

          {/* Consistency score and badges */}
          <Achievements refreshKey={achievementsKey} />

          {/* Body metrics */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="Bodyweight"
              subtitle={hasWeight ? 'From your check-ins' : undefined}
              empty={hasWeight ? null : 'Record a check-in with your weight to chart it.'}
              action={<ChangeChip value={change.weightKg} unit=" kg" goodDirection="down" />}
            >
              <MetricLine data={bodySeries} dataKey="weightKg" name="Weight" unit=" kg" />
              <ChartDataTable
                caption="Bodyweight by check-in date"
                columns={[
                  { key: 'date', label: 'Date', format: fmtDate },
                  { key: 'weightKg', label: 'Weight (kg)' },
                ]}
                rows={bodySeries.filter((p) => p.weightKg != null)}
              />
            </ChartCard>

            <ChartCard
              title="Body fat"
              subtitle="Navy circumference method"
              empty={
                hasBodyFat
                  ? null
                  : 'Add neck and waist measurements to a check-in to estimate body fat.'
              }
              action={
                <ChangeChip value={change.bodyFatPercent} unit="%" goodDirection="down" />
              }
            >
              <MetricLine
                data={bodySeries}
                dataKey="bodyFatPercent"
                name="Body fat"
                unit="%"
              />
              <ChartDataTable
                caption="Body-fat estimate by check-in date"
                columns={[
                  { key: 'date', label: 'Date', format: fmtDate },
                  { key: 'bodyFatPercent', label: 'Body fat (%)' },
                ]}
                rows={bodySeries.filter((p) => p.bodyFatPercent != null)}
              />
            </ChartCard>
          </div>

          {hasComposition && (
            <ChartCard
              title="Body composition"
              subtitle="Lean and fat mass sum to your bodyweight"
              action={
                <ChangeChip value={change.leanMassKg} unit=" kg lean" goodDirection="up" />
              }
            >
              <CompositionArea data={bodySeries} />
              <ChartDataTable
                caption="Lean and fat mass by check-in date"
                columns={[
                  { key: 'date', label: 'Date', format: fmtDate },
                  { key: 'leanMassKg', label: 'Lean (kg)' },
                  { key: 'fatMassKg', label: 'Fat (kg)' },
                ]}
                rows={bodySeries.filter((p) => p.leanMassKg != null)}
              />
            </ChartCard>
          )}

          {/* Measurements — faceted, one small chart each */}
          {bodySeries.filter((p) => p.waistCm != null).length >= 2 && (
            <section className="panel p-5 sm:p-6">
              <h3 className="font-bold">Measurements</h3>
              <p className="mt-0.5 text-xs text-fog-dim">
                Shown as separate charts rather than one — the values differ too much
                in scale to share an axis.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ['waistCm', 'Waist'],
                  ['chestCm', 'Chest'],
                  ['armCm', 'Arm'],
                  ['thighCm', 'Thigh'],
                  ['hipCm', 'Hip'],
                ].map(([key, label]) => (
                  <MeasurementSparkline
                    key={key}
                    data={bodySeries}
                    dataKey={key}
                    label={label}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Training */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="Weekly training volume"
              subtitle="Total load moved — sets × reps × weight"
              empty={hasVolume ? null : 'Log a session to start tracking volume.'}
            >
              <VolumeBars data={volumeByWeek} />
              <ChartDataTable
                caption="Training volume by week"
                columns={[
                  { key: 'weekStart', label: 'Week of', format: fmtDate },
                  { key: 'sessions', label: 'Sessions' },
                  { key: 'volumeKg', label: 'Volume (kg)', format: (v) => nf.format(v) },
                ]}
                rows={volumeByWeek}
              />
            </ChartCard>

            <ChartCard
              title="Consistency"
              subtitle={`${consistency.adherencePercent}% of planned sessions over ${consistency.windowWeeks} weeks`}
              empty={
                consistency.totalSessions > 0
                  ? null
                  : 'Log sessions to track consistency against your plan.'
              }
            >
              <ConsistencyBars
                data={consistency.weekly}
                target={consistency.trainingDaysPerWeek}
              />
              <ChartDataTable
                caption="Sessions per week against target"
                columns={[
                  { key: 'weekStart', label: 'Week of', format: fmtDate },
                  { key: 'sessions', label: 'Sessions' },
                  { key: 'target', label: 'Target' },
                ]}
                rows={consistency.weekly}
              />
            </ChartCard>
          </div>

          {/* Personal records */}
          {personalRecords.length > 0 && (
            <section className="panel p-5 sm:p-6">
              <h3 className="flex items-center gap-2 font-bold">
                <Trophy size={16} className="text-volt" aria-hidden="true" />
                Personal records
              </h3>
              <p className="mt-0.5 text-xs text-fog-dim">
                Ranked by estimated one-rep max (Epley formula from your best set).
              </p>

              <ul className="mt-4 divide-y divide-line">
                {personalRecords.map((pr) => (
                  <li key={pr.slug} className="flex items-center gap-4 py-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/exercises/${encodeURIComponent(pr.slug)}`}
                        className="truncate font-semibold hover:text-volt"
                      >
                        {pr.name}
                      </Link>
                      <p className="text-xs text-fog-dim">
                        Best set {pr.topSetWeightKg} kg · {fmtDate(pr.date)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-display text-lg text-volt tabular-nums">
                        {pr.estimatedOneRepMaxKg}
                      </p>
                      <p className="text-[0.625rem] tracking-wide text-fog-dim uppercase">
                        est. 1RM
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="flex items-start gap-2 text-xs text-fog-dim">
            <Info size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
            The Navy body-fat method is a circumference regression: it tracks your
            trend well but is less reliable as an absolute figure. Estimated 1RM is
            calculated, not tested.
          </p>
        </>
      )}
    </div>
  );
};
