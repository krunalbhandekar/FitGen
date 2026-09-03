import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import {
  AlertTriangle,
  Check,
  Dumbbell,
  HeartPulse,
  RefreshCw,
  Salad,
  Target,
  Trash2,
  User,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  Badge,
  Button,
  cx,
  ErrorState,
  PageHeader,
  Spinner,
} from '../components/ui';
import {
  ChipMultiSelect,
  Field,
  NumberInput,
  OptionCards,
  SegmentedControl,
  Select,
  TagInput,
  TextInput,
  humanise,
} from '../components/form';
import { TargetsPanel } from '../components/TargetsPanel';

/**
 * Editable profile/settings.
 *
 * Each section saves independently with PATCH, so a user changing one thing
 * doesn't resubmit their whole profile. The server decides whether a change is
 * plan-relevant and returns `changedFields`, which drives the regeneration
 * banner — the client never guesses at that.
 */

const FIELD_LABELS = {
  gender: 'sex',
  dateOfBirth: 'date of birth',
  heightCm: 'height',
  weightKg: 'weight',
  goal: 'goal',
  targetWeightKg: 'target weight',
  activityLevel: 'activity level',
  trainingDaysPerWeek: 'training days',
  preferredSplit: 'split',
  availableEquipment: 'equipment',
  dietType: 'diet type',
  allergies: 'allergies',
  dislikedFoods: 'disliked foods',
  mealsPerDay: 'meals per day',
  injuries: 'injuries',
};

/**
 * Maps a stored profile onto form values. Used both on load and after a save,
 * so the form always mirrors what the server actually persisted (it normalises
 * some fields — allergies are lower-cased and de-duplicated, for instance).
 */
const toFormValues = (profile = {}) => ({
  fullName: profile.fullName ?? '',
  gender: profile.gender ?? '',
  dateOfBirth: profile.dateOfBirth?.slice(0, 10) ?? '',
  heightCm: profile.heightCm ?? '',
  weightKg: profile.weightKg ?? '',
  goal: profile.goal ?? '',
  targetWeightKg: profile.targetWeightKg ?? '',
  activityLevel: profile.activityLevel ?? '',
  trainingDaysPerWeek: profile.trainingDaysPerWeek ?? 4,
  preferredSplit: profile.preferredSplit ?? '',
  availableEquipment: profile.availableEquipment ?? [],
  dietType: profile.dietType ?? '',
  mealsPerDay: profile.mealsPerDay ?? 3,
  allergies: profile.allergies ?? [],
  dislikedFoods: profile.dislikedFoods ?? [],
  injuries: profile.injuries ?? [],
});

/* ------------------------------------------------------------------ Section */

const Section = ({ icon: Icon, title, description, children, onSave, saving, dirty, saved }) => (
  <section className="panel p-6 sm:p-8">
    <div className="mb-6 flex items-start gap-3 border-b border-line pb-5">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-volt/10 text-volt">
        <Icon size={18} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-bold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-fog">{description}</p>}
      </div>
    </div>

    <div className="space-y-6">{children}</div>

    <div className="mt-7 flex items-center gap-3 border-t border-line pt-5">
      <Button type="button" onClick={onSave} loading={saving} disabled={!dirty}>
        Save changes
      </Button>
      {saved && !dirty && (
        <span className="flex items-center gap-1.5 text-sm text-volt">
          <Check size={15} aria-hidden="true" />
          Saved
        </span>
      )}
      {dirty && !saving && (
        <span className="text-sm text-fog-dim">Unsaved changes</span>
      )}
    </div>
  </section>
);

/* --------------------------------------------------------------------- Page */

export const Profile = () => {
  const { updateUser } = useAuth();

  const [options, setOptions] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingSection, setSavingSection] = useState(null);
  const [savedSection, setSavedSection] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [acknowledging, setAcknowledging] = useState(false);

  const {
    register,
    control,
    getValues,
    reset,
    watch,
    setError: setFieldError,
    formState: { errors, dirtyFields },
  } = useForm({ mode: 'onTouched' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileRes, optionsRes] = await Promise.all([
        api.get('/profile'),
        api.get('/profile/options'),
      ]);
      const payload = profileRes.data.data;
      setData(payload);
      setOptions(optionsRes.data.data);
      reset(toFormValues(payload.profile));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [reset]);

  useEffect(() => {
    load();
  }, [load]);

  /** Saves only the named fields, so one section can't clobber another. */
  const saveSection = async (sectionId, fields) => {
    setSavingSection(sectionId);
    setSaveError(null);
    setSavedSection(null);

    const values = getValues();
    const payload = {};
    for (const field of fields) {
      const value = values[field];
      // Skip empty optional numbers rather than sending '' or NaN.
      if (value === '' || value === null || Number.isNaN(value)) continue;
      payload[field] = value;
    }

    if (Object.keys(payload).length === 0) {
      setSavingSection(null);
      return;
    }

    try {
      const { data: response } = await api.patch('/profile', payload);
      setData(response.data);
      updateUser(response.user);
      setSavedSection(sectionId);

      // Re-baseline from what the server stored: this clears the dirty flags and
      // reflects any normalisation it applied.
      reset(toFormValues(response.data.profile));
    } catch (err) {
      setSaveError(err.message);
      if (err.details && typeof err.details === 'object') {
        Object.entries(err.details).forEach(([field, message]) => {
          setFieldError(field, { type: 'server', message });
        });
      }
    } finally {
      setSavingSection(null);
    }
  };

  const acknowledge = async () => {
    setAcknowledging(true);
    try {
      const { data: response } = await api.post('/profile/regeneration/acknowledge');
      setData(response.data);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setAcknowledging(false);
    }
  };

  const isDirty = (fields) => fields.some((field) => dirtyFields[field]);
  const goal = watch('goal');

  if (loading) return <Spinner label="Loading your profile" className="min-h-[60vh]" />;

  if (error) {
    return (
      <div className="shell py-12">
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }

  if (!data.onboardingCompleted) {
    return (
      <div className="shell max-w-2xl py-16 text-center">
        <h1 className="display-lg">Finish setup first</h1>
        <p className="mt-3 text-fog">
          Your profile is {data.completeness.percent}% complete. Run the setup wizard,
          then you can edit any of it here.
        </p>
        <Button as={Link} to="/onboarding" size="lg" className="mt-8">
          Start setup
        </Button>
      </div>
    );
  }

  return (
    <div className="shell max-w-4xl space-y-6 py-8 sm:py-12">
      <PageHeader
        eyebrow="Settings"
        title="Your profile"
        description="Change anything here and your plan is flagged for regeneration."
        actions={<Badge tone="neutral">Profile v{data.profileVersion}</Badge>}
      />

      {/* Regeneration banner */}
      {data.planRegeneration.required && (
        <div className="panel relative overflow-hidden p-5 sm:p-6">
          <div className="stripes absolute inset-x-0 top-0 h-1.5" aria-hidden="true" />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <RefreshCw size={18} className="mt-0.5 shrink-0 text-volt" aria-hidden="true" />
              <div>
                <p className="font-bold">Your plan is out of date</p>
                <p className="mt-1 text-sm text-fog">
                  You changed{' '}
                  {data.planRegeneration.reasons
                    .map((field) => FIELD_LABELS[field] ?? humanise(field))
                    .join(', ')}
                  . Regenerate your plans to pick up the change.
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
              <Button
                variant="ghost"
                size="sm"
                onClick={acknowledge}
                loading={acknowledging}
              >
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}

      {saveError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-ember/30 bg-ember/8 p-3.5 text-sm text-ember"
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{saveError}</span>
        </div>
      )}

      {/* Current targets */}
      <section>
        <h2 className="eyebrow mb-4">Current targets</h2>
        <TargetsPanel targets={data.targets} />
      </section>

      {/* ------------------------------------------------------- Basics */}
      <Section
        icon={User}
        title="About you"
        description="Body stats feed the BMR and TDEE formulas."
        onSave={() =>
          saveSection('basics', [
            'fullName',
            'gender',
            'dateOfBirth',
            'heightCm',
            'weightKg',
          ])
        }
        saving={savingSection === 'basics'}
        saved={savedSection === 'basics'}
        dirty={isDirty(['fullName', 'gender', 'dateOfBirth', 'heightCm', 'weightKg'])}
      >
        <Field
          label="Display name"
          htmlFor="p-fullName"
          error={errors.fullName?.message}
          hint="Shown in the top bar and your dashboard greeting. Doesn't affect your plan."
        >
          <TextInput id="p-fullName" error={errors.fullName} {...register('fullName')} />
        </Field>

        <Field label="Sex" error={errors.gender?.message}>
          <Controller
            control={control}
            name="gender"
            render={({ field }) => (
              <SegmentedControl
                name="Sex"
                value={field.value}
                onChange={field.onChange}
                options={options.genders}
              />
            )}
          />
        </Field>

        <Field label="Date of birth" htmlFor="p-dob" error={errors.dateOfBirth?.message}>
          <TextInput id="p-dob" type="date" error={errors.dateOfBirth} {...register('dateOfBirth')} />
        </Field>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Height" htmlFor="p-height" error={errors.heightCm?.message}>
            <NumberInput
              id="p-height"
              unit="cm"
              step="0.5"
              error={errors.heightCm}
              {...register('heightCm', { valueAsNumber: true })}
            />
          </Field>
          <Field label="Current weight" htmlFor="p-weight" error={errors.weightKg?.message}
            hint="Update this as you progress — targets recompute.">
            <NumberInput
              id="p-weight"
              unit="kg"
              step="0.1"
              error={errors.weightKg}
              {...register('weightKg', { valueAsNumber: true })}
            />
          </Field>
        </div>
      </Section>

      {/* -------------------------------------------------------- Goals */}
      <Section
        icon={Target}
        title="Goal & training"
        onSave={() =>
          saveSection('goals', [
            'goal',
            'targetWeightKg',
            'activityLevel',
            'trainingDaysPerWeek',
            'preferredSplit',
          ])
        }
        saving={savingSection === 'goals'}
        saved={savedSection === 'goals'}
        dirty={isDirty([
          'goal',
          'targetWeightKg',
          'activityLevel',
          'trainingDaysPerWeek',
          'preferredSplit',
        ])}
      >
        <Field label="Primary goal" error={errors.goal?.message}>
          <Controller
            control={control}
            name="goal"
            render={({ field }) => (
              <OptionCards
                name="Goal"
                value={field.value}
                onChange={field.onChange}
                options={options.goals.map((g) => ({
                  value: g.value,
                  label: g.label,
                  description:
                    g.calorieAdjustmentPercent === 0
                      ? 'Maintenance calories'
                      : `${g.calorieAdjustmentPercent > 0 ? '+' : ''}${g.calorieAdjustmentPercent}% calories`,
                }))}
              />
            )}
          />
        </Field>

        <Field
          label="Target weight"
          htmlFor="p-target"
          error={errors.targetWeightKg?.message}
          hint={
            goal === 'lose_fat'
              ? 'Must be below your current weight.'
              : goal === 'build_muscle'
                ? 'Must be at or above your current weight.'
                : 'Optional.'
          }
        >
          <NumberInput
            id="p-target"
            unit="kg"
            step="0.1"
            error={errors.targetWeightKg}
            {...register('targetWeightKg', { valueAsNumber: true })}
          />
        </Field>

        <Field label="Activity level" error={errors.activityLevel?.message}>
          <Controller
            control={control}
            name="activityLevel"
            render={({ field }) => (
              <OptionCards
                name="Activity level"
                columns={1}
                value={field.value}
                onChange={field.onChange}
                options={options.activityLevels.map((a) => ({
                  value: a.value,
                  label: `${humanise(a.value)} (×${a.multiplier})`,
                  description: a.label,
                }))}
              />
            )}
          />
        </Field>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Training days per week" htmlFor="p-days"
            error={errors.trainingDaysPerWeek?.message}>
            <Select
              id="p-days"
              options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({
                value: n,
                label: `${n} day${n > 1 ? 's' : ''}`,
              }))}
              {...register('trainingDaysPerWeek', { valueAsNumber: true })}
            />
          </Field>
          <Field label="Preferred split" error={errors.preferredSplit?.message}>
            <Controller
              control={control}
              name="preferredSplit"
              render={({ field }) => (
                <Select
                  options={options.splits.map((s) => ({
                    value: s.value,
                    label: `${s.label} (min ${s.minDays} days)`,
                  }))}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </Field>
        </div>
      </Section>

      {/* ---------------------------------------------------- Equipment */}
      <Section
        icon={Dumbbell}
        title="Equipment"
        description="Only exercises using this equipment will be prescribed."
        onSave={() => saveSection('equipment', ['availableEquipment'])}
        saving={savingSection === 'equipment'}
        saved={savedSection === 'equipment'}
        dirty={isDirty(['availableEquipment'])}
      >
        <Field error={errors.availableEquipment?.message}>
          <Controller
            control={control}
            name="availableEquipment"
            render={({ field }) => (
              <ChipMultiSelect
                name="Equipment"
                value={field.value}
                onChange={field.onChange}
                options={options.equipment}
              />
            )}
          />
        </Field>
      </Section>

      {/* --------------------------------------------------------- Diet */}
      <Section
        icon={Salad}
        title="Diet"
        onSave={() =>
          saveSection('diet', ['dietType', 'mealsPerDay', 'allergies', 'dislikedFoods'])
        }
        saving={savingSection === 'diet'}
        saved={savedSection === 'diet'}
        dirty={isDirty(['dietType', 'mealsPerDay', 'allergies', 'dislikedFoods'])}
      >
        <Field label="Diet type" error={errors.dietType?.message}>
          <Controller
            control={control}
            name="dietType"
            render={({ field }) => (
              <OptionCards
                name="Diet type"
                value={field.value}
                onChange={field.onChange}
                options={options.dietTypes.map((d) => ({ value: d, label: humanise(d) }))}
              />
            )}
          />
        </Field>

        <Field label="Meals per day" htmlFor="p-meals" error={errors.mealsPerDay?.message}>
          <Select
            id="p-meals"
            options={[2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: n, label: `${n} meals` }))}
            {...register('mealsPerDay', { valueAsNumber: true })}
          />
        </Field>

        <Field label="Allergies">
          <Controller
            control={control}
            name="allergies"
            render={({ field }) => (
              <TagInput
                value={field.value}
                onChange={field.onChange}
                placeholder="Add an allergy"
              />
            )}
          />
        </Field>

        <Field label="Foods you dislike">
          <Controller
            control={control}
            name="dislikedFoods"
            render={({ field }) => (
              <TagInput
                value={field.value}
                onChange={field.onChange}
                placeholder="Add a food"
              />
            )}
          />
        </Field>
      </Section>

      {/* ----------------------------------------------------- Injuries */}
      <Section
        icon={HeartPulse}
        title="Injuries"
        description="Exercises loading these areas get substituted."
        onSave={() => saveSection('injuries', ['injuries'])}
        saving={savingSection === 'injuries'}
        saved={savedSection === 'injuries'}
        dirty={isDirty(['injuries'])}
      >
        <Controller
          control={control}
          name="injuries"
          render={({ field }) => (
            <div className="space-y-4">
              {field.value.length === 0 && (
                <div className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-fog">
                  No injuries recorded
                </div>
              )}

              <ul className="space-y-3">
                {field.value.map((injury, index) => (
                  <li key={index} className="rounded-xl border border-line bg-panel-2 p-4">
                    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                      <Select
                        aria-label="Injury area"
                        value={injury.area}
                        onChange={(event) => {
                          const list = [...field.value];
                          list[index] = { ...injury, area: event.target.value };
                          field.onChange(list);
                        }}
                        options={options.injuryAreas}
                      />
                      <Select
                        aria-label="Severity"
                        value={injury.severity}
                        onChange={(event) => {
                          const list = [...field.value];
                          list[index] = { ...injury, severity: event.target.value };
                          field.onChange(list);
                        }}
                        options={options.injurySeverities}
                      />
                      <button
                        type="button"
                        aria-label="Remove injury"
                        onClick={() =>
                          field.onChange(field.value.filter((_, i) => i !== index))
                        }
                        className="grid h-11 w-full place-items-center rounded-xl border border-line text-fog-dim transition-colors hover:border-ember hover:text-ember sm:w-11"
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                    <TextInput
                      className="mt-3"
                      placeholder="Notes (optional)"
                      maxLength={300}
                      value={injury.notes ?? ''}
                      onChange={(event) => {
                        const list = [...field.value];
                        list[index] = { ...injury, notes: event.target.value };
                        field.onChange(list);
                      }}
                    />
                  </li>
                ))}
              </ul>

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={field.value.length >= 12}
                onClick={() =>
                  field.onChange([
                    ...field.value,
                    { area: options.injuryAreas[0], severity: 'mild', notes: '' },
                  ])
                }
              >
                Add an injury
              </Button>
            </div>
          )}
        />
      </Section>

      <p className={cx('text-xs text-fog-dim')}>
        Re-running the{' '}
        <Link to="/onboarding" className="text-fog underline hover:text-volt">
          setup wizard
        </Link>{' '}
        overwrites all of the above.
      </p>
    </div>
  );
};
