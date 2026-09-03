import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Dumbbell,
  HeartPulse,
  Salad,
  Sparkles,
  Target,
  Trash2,
  User,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Badge, Button, cx, ErrorState, Spinner } from '../components/ui';
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
 * Five-step onboarding wizard, matching the report's flow:
 * basic info → goals → equipment → diet → injuries, plus a review step that
 * shows the computed targets before anything is saved.
 *
 * Validation runs per step (React Hook Form), so a user is never told about a
 * problem three screens after causing it. The server re-validates everything on
 * submit — the client rules are UX, not security.
 */

const STEPS = [
  { id: 'basics', title: 'About you', icon: User, fields: ['fullName', 'gender', 'dateOfBirth', 'heightCm', 'weightKg'] },
  { id: 'goals', title: 'Your goal', icon: Target, fields: ['goal', 'targetWeightKg', 'activityLevel', 'trainingDaysPerWeek', 'preferredSplit'] },
  { id: 'equipment', title: 'Equipment', icon: Dumbbell, fields: ['availableEquipment'] },
  { id: 'diet', title: 'Diet', icon: Salad, fields: ['dietType', 'mealsPerDay', 'allergies', 'dislikedFoods'] },
  { id: 'injuries', title: 'Injuries', icon: HeartPulse, fields: ['injuries'] },
  { id: 'review', title: 'Review', icon: Sparkles, fields: [] },
];

/** Max date for the DOB input — 13 years ago, matching the server rule. */
const maxDob = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 13);
  return d.toISOString().slice(0, 10);
};

const minDob = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 100);
  return d.toISOString().slice(0, 10);
};

/* ------------------------------------------------------------ Step chrome */

const StepIndicator = ({ steps, current, onJump }) => (
  <nav aria-label="Progress">
    {/* Mobile: compact progress bar */}
    <div className="sm:hidden">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-bold">
          {steps[current].title}
        </p>
        <p className="text-xs text-fog-dim tabular-nums">
          {current + 1} / {steps.length}
        </p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel-2">
        <div
          className="h-full rounded-full bg-volt transition-[width] duration-300"
          style={{ width: `${((current + 1) / steps.length) * 100}%` }}
        />
      </div>
    </div>

    {/* Desktop: full stepper */}
    <ol className="hidden sm:flex sm:items-center sm:gap-1">
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;
        const Icon = step.icon;

        return (
          <li key={step.id} className="flex flex-1 items-center gap-1">
            <button
              type="button"
              onClick={() => done && onJump(index)}
              disabled={!done}
              aria-current={active ? 'step' : undefined}
              className={cx(
                'flex min-w-0 items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold transition-colors',
                active && 'bg-volt/10 text-volt',
                done && 'text-fog hover:bg-panel-2 hover:text-chalk',
                !active && !done && 'text-fog-dim',
              )}
            >
              <span
                className={cx(
                  'grid size-6 shrink-0 place-items-center rounded-full text-xs',
                  active && 'bg-volt text-ink',
                  done && 'bg-volt/20 text-volt',
                  !active && !done && 'bg-panel-2 text-fog-dim',
                )}
              >
                {done ? <Check size={12} aria-hidden="true" /> : <Icon size={12} aria-hidden="true" />}
              </span>
              <span className="truncate">{step.title}</span>
            </button>
            {index < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={cx('h-px flex-1', done ? 'bg-volt/30' : 'bg-line')}
              />
            )}
          </li>
        );
      })}
    </ol>
  </nav>
);

/* ------------------------------------------------------------------ Page */

export const Onboarding = () => {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();

  const [options, setOptions] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    trigger,
    watch,
    getValues,
    setValue,
    setError,
    formState: { errors },
  } = useForm({
    mode: 'onTouched',
    defaultValues: {
      fullName: user?.profile?.fullName || user?.name || '',
      gender: user?.profile?.gender ?? '',
      dateOfBirth: user?.profile?.dateOfBirth?.slice?.(0, 10) ?? '',
      heightCm: user?.profile?.heightCm ?? '',
      weightKg: user?.profile?.weightKg ?? '',
      goal: user?.profile?.goal ?? '',
      targetWeightKg: user?.profile?.targetWeightKg ?? '',
      activityLevel: user?.profile?.activityLevel ?? '',
      trainingDaysPerWeek: user?.profile?.trainingDaysPerWeek ?? 4,
      preferredSplit: user?.profile?.preferredSplit ?? '',
      availableEquipment: user?.profile?.availableEquipment ?? [],
      dietType: user?.profile?.dietType ?? '',
      mealsPerDay: user?.profile?.mealsPerDay ?? 3,
      allergies: user?.profile?.allergies ?? [],
      dislikedFoods: user?.profile?.dislikedFoods ?? [],
      injuries: user?.profile?.injuries ?? [],
    },
  });

  useEffect(() => {
    api
      .get('/profile/options')
      .then(({ data }) => setOptions(data.data))
      .catch((err) => setLoadError(err.message));
  }, []);

  const goal = watch('goal');
  const split = watch('preferredSplit');
  const trainingDays = watch('trainingDaysPerWeek');
  const injuries = watch('injuries');
  const equipment = watch('availableEquipment');

  const isReview = STEPS[step].id === 'review';

  /* --- live target preview on the review step --- */
  const fetchPreview = useCallback(async () => {
    const v = getValues();
    if (!v.gender || !v.dateOfBirth || !v.heightCm || !v.weightKg || !v.activityLevel || !v.goal) {
      return;
    }
    setPreviewing(true);
    try {
      const { data } = await api.post('/profile/targets/preview', {
        gender: v.gender,
        dateOfBirth: v.dateOfBirth,
        heightCm: v.heightCm,
        weightKg: v.weightKg,
        activityLevel: v.activityLevel,
        goal: v.goal,
        ...(v.targetWeightKg ? { targetWeightKg: v.targetWeightKg } : {}),
      });
      setPreview(data.data);
    } catch {
      setPreview(null);
    } finally {
      setPreviewing(false);
    }
  }, [getValues]);

  useEffect(() => {
    if (isReview) fetchPreview();
  }, [isReview, fetchPreview]);

  /* --- split vs training-days consistency, mirrored from the server --- */
  const splitWarning = useMemo(() => {
    if (!split || !trainingDays || !options) return null;
    const chosen = options.splits.find((s) => s.value === split);
    if (chosen && trainingDays < chosen.minDays) {
      return `${chosen.label} needs at least ${chosen.minDays} training days per week.`;
    }
    return null;
  }, [split, trainingDays, options]);

  const next = async () => {
    const valid = await trigger(STEPS[step].fields);
    if (!valid) return;

    // Block the same cross-field rule the API enforces, before submitting.
    if (STEPS[step].id === 'goals' && splitWarning) {
      setError('preferredSplit', { type: 'manual', message: splitWarning });
      return;
    }

    setStep((current) => Math.min(current + 1, STEPS.length - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const back = () => {
    setStep((current) => Math.max(current - 1, 0));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onSubmit = async (values) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = {
        ...values,
        // Empty optional numbers must be omitted, not sent as ''.
        ...(values.targetWeightKg ? { targetWeightKg: values.targetWeightKg } : {}),
      };
      if (!payload.targetWeightKg) delete payload.targetWeightKg;
      if (!payload.fullName) delete payload.fullName;

      const { data } = await api.put('/profile/onboarding', payload);
      updateUser(data.user);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setSubmitError(err.message);
      // Surface server-side field errors on the right inputs.
      const details = err.details;
      if (details && typeof details === 'object') {
        Object.entries(details).forEach(([field, message]) => {
          setError(field, { type: 'server', message });
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) {
    return (
      <div className="shell py-16">
        <ErrorState message={loadError} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  if (!options) return <Spinner label="Preparing your setup" className="min-h-[60vh]" />;

  const currentStep = STEPS[step];

  return (
    <div className="shell max-w-3xl py-8 sm:py-12">
      <header className="mb-8">
        <Badge tone="volt">Setup</Badge>
        <h1 className="display-lg mt-4 text-balance">
          Let&apos;s build your profile
        </h1>
        <p className="mt-3 text-sm text-fog sm:text-base">
          Six quick steps. Everything here is editable later, and changing it
          regenerates your plan.
        </p>
      </header>

      <div className="mb-8">
        <StepIndicator steps={STEPS} current={step} onJump={setStep} />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="panel p-6 sm:p-8">
          <div className="mb-6 flex items-center gap-3 border-b border-line pb-5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-volt/10 text-volt">
              <currentStep.icon size={18} aria-hidden="true" />
            </span>
            <div>
              <p className="eyebrow">Step {step + 1} of {STEPS.length}</p>
              <h2 className="text-lg font-bold">{currentStep.title}</h2>
            </div>
          </div>

          {/* ------------------------------------------------- 1. Basics */}
          {currentStep.id === 'basics' && (
            <div className="space-y-6">
              <Field
                label="Display name"
                htmlFor="fullName"
                error={errors.fullName?.message}
                hint="Shown in the top bar and your dashboard greeting. Defaults to your Google name."
              >
                <TextInput
                  id="fullName"
                  placeholder="How should we address you?"
                  error={errors.fullName}
                  {...register('fullName', { maxLength: { value: 80, message: 'Too long' } })}
                />
              </Field>

              <Field label="Sex" required error={errors.gender?.message}
                hint="Used by the Mifflin-St Jeor BMR formula. 'Other' uses the midpoint of the male and female constants.">
                <Controller
                  control={control}
                  name="gender"
                  rules={{ required: 'Please choose one' }}
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

              <Field label="Date of birth" required htmlFor="dateOfBirth"
                error={errors.dateOfBirth?.message}>
                <TextInput
                  id="dateOfBirth"
                  type="date"
                  min={minDob()}
                  max={maxDob()}
                  error={errors.dateOfBirth}
                  {...register('dateOfBirth', { required: 'Date of birth is required' })}
                />
              </Field>

              <div className="grid gap-6 sm:grid-cols-2">
                <Field label="Height" required htmlFor="heightCm" error={errors.heightCm?.message}>
                  <NumberInput
                    id="heightCm"
                    unit="cm"
                    step="0.5"
                    placeholder="175"
                    error={errors.heightCm}
                    {...register('heightCm', {
                      required: 'Height is required',
                      valueAsNumber: true,
                      min: { value: 80, message: 'Must be at least 80 cm' },
                      max: { value: 260, message: 'Must be under 260 cm' },
                    })}
                  />
                </Field>

                <Field label="Current weight" required htmlFor="weightKg" error={errors.weightKg?.message}>
                  <NumberInput
                    id="weightKg"
                    unit="kg"
                    step="0.1"
                    placeholder="70"
                    error={errors.weightKg}
                    {...register('weightKg', {
                      required: 'Weight is required',
                      valueAsNumber: true,
                      min: { value: 25, message: 'Must be at least 25 kg' },
                      max: { value: 350, message: 'Must be under 350 kg' },
                    })}
                  />
                </Field>
              </div>
            </div>
          )}

          {/* -------------------------------------------------- 2. Goals */}
          {currentStep.id === 'goals' && (
            <div className="space-y-6">
              <Field label="Primary goal" required error={errors.goal?.message}>
                <Controller
                  control={control}
                  name="goal"
                  rules={{ required: 'Pick a goal' }}
                  render={({ field }) => (
                    <OptionCards
                      name="Primary goal"
                      value={field.value}
                      onChange={field.onChange}
                      options={options.goals.map((g) => ({
                        value: g.value,
                        label: g.label,
                        description:
                          g.calorieAdjustmentPercent === 0
                            ? 'Calories at maintenance'
                            : `${g.calorieAdjustmentPercent > 0 ? '+' : ''}${g.calorieAdjustmentPercent}% calories vs maintenance`,
                      }))}
                    />
                  )}
                />
              </Field>

              <Field
                label="Target weight"
                htmlFor="targetWeightKg"
                error={errors.targetWeightKg?.message}
                hint={
                  goal === 'lose_fat'
                    ? 'Must be below your current weight.'
                    : goal === 'build_muscle'
                      ? 'Must be at or above your current weight.'
                      : 'Optional — used to project how long your goal will take.'
                }
              >
                <NumberInput
                  id="targetWeightKg"
                  unit="kg"
                  step="0.1"
                  placeholder="Optional"
                  error={errors.targetWeightKg}
                  {...register('targetWeightKg', {
                    valueAsNumber: true,
                    validate: (value) => {
                      if (!value || Number.isNaN(value)) return true;
                      if (value < 25 || value > 350) return 'Must be between 25 and 350 kg';
                      const current = getValues('weightKg');
                      if (goal === 'lose_fat' && current && value > current) {
                        return 'For fat loss, target must be below your current weight';
                      }
                      if (goal === 'build_muscle' && current && value < current) {
                        return 'For muscle gain, target must be at or above your current weight';
                      }
                      return true;
                    },
                  })}
                />
              </Field>

              <Field label="Activity level" required error={errors.activityLevel?.message}
                hint="Excludes your training — this is your baseline daily movement.">
                <Controller
                  control={control}
                  name="activityLevel"
                  rules={{ required: 'Pick your activity level' }}
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
                <Field label="Training days per week" required htmlFor="trainingDaysPerWeek"
                  error={errors.trainingDaysPerWeek?.message}>
                  <Select
                    id="trainingDaysPerWeek"
                    error={errors.trainingDaysPerWeek}
                    options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({
                      value: n,
                      label: `${n} day${n > 1 ? 's' : ''}`,
                    }))}
                    {...register('trainingDaysPerWeek', {
                      required: 'Required',
                      valueAsNumber: true,
                    })}
                  />
                </Field>

                <Field label="Preferred split" required error={errors.preferredSplit?.message}>
                  <Controller
                    control={control}
                    name="preferredSplit"
                    rules={{ required: 'Pick a split' }}
                    render={({ field }) => (
                      <Select
                        placeholder="Choose a split"
                        error={errors.preferredSplit}
                        options={options.splits.map((s) => ({
                          value: s.value,
                          label: `${s.label} (min ${s.minDays} days)`,
                        }))}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                      />
                    )}
                  />
                </Field>
              </div>

              {splitWarning && !errors.preferredSplit && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl border border-ember/30 bg-ember/8 p-3.5 text-sm text-ember"
                >
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{splitWarning}</span>
                </div>
              )}
            </div>
          )}

          {/* ---------------------------------------------- 3. Equipment */}
          {currentStep.id === 'equipment' && (
            <div className="space-y-6">
              <Field
                label="What equipment can you use?"
                required
                error={errors.availableEquipment?.message}
                hint={`Pulled from the ${options.equipment.length} equipment types present in the verified exercise library — so your plan can only ever contain exercises you can actually perform.`}
              >
                <Controller
                  control={control}
                  name="availableEquipment"
                  rules={{
                    validate: (value) =>
                      (value?.length ?? 0) > 0 || 'Select at least one — "body only" counts',
                  }}
                  render={({ field }) => (
                    <ChipMultiSelect
                      name="Available equipment"
                      value={field.value}
                      onChange={field.onChange}
                      options={options.equipment}
                    />
                  )}
                />
              </Field>

              <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
                <p className="mr-auto text-sm text-fog">
                  {equipment?.length ?? 0} selected
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setValue('availableEquipment', options.equipment)}
                >
                  Select all
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setValue('availableEquipment', ['body only'])}
                >
                  Bodyweight only
                </Button>
              </div>
            </div>
          )}

          {/* --------------------------------------------------- 4. Diet */}
          {currentStep.id === 'diet' && (
            <div className="space-y-6">
              <Field label="Diet type" required error={errors.dietType?.message}>
                <Controller
                  control={control}
                  name="dietType"
                  rules={{ required: 'Pick a diet type' }}
                  render={({ field }) => (
                    <OptionCards
                      name="Diet type"
                      value={field.value}
                      onChange={field.onChange}
                      options={options.dietTypes.map((d) => ({
                        value: d,
                        label: humanise(d),
                      }))}
                    />
                  )}
                />
              </Field>

              <Field label="Meals per day" required htmlFor="mealsPerDay"
                error={errors.mealsPerDay?.message}
                hint="Your daily macros get divided across these.">
                <Select
                  id="mealsPerDay"
                  error={errors.mealsPerDay}
                  options={[2, 3, 4, 5, 6, 7, 8].map((n) => ({
                    value: n,
                    label: `${n} meals`,
                  }))}
                  {...register('mealsPerDay', { required: 'Required', valueAsNumber: true })}
                />
              </Field>

              <Field label="Allergies" hint="Foods containing these are excluded from your plan.">
                <Controller
                  control={control}
                  name="allergies"
                  render={({ field }) => (
                    <TagInput
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="e.g. peanuts — press Enter"
                    />
                  )}
                />
              </Field>

              <Field label="Foods you dislike" hint="We'll avoid these where possible.">
                <Controller
                  control={control}
                  name="dislikedFoods"
                  render={({ field }) => (
                    <TagInput
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="e.g. mushroom — press Enter"
                    />
                  )}
                />
              </Field>
            </div>
          )}

          {/* ----------------------------------------------- 5. Injuries */}
          {currentStep.id === 'injuries' && (
            <Controller
              control={control}
              name="injuries"
              render={({ field }) => (
                <div className="space-y-5">
                  <p className="text-sm text-fog">
                    Add anything that limits your training. Exercises loading these areas
                    get substituted rather than prescribed. Leave empty if nothing applies.
                  </p>

                  {field.value.length === 0 && (
                    <div className="rounded-xl border border-dashed border-line p-6 text-center">
                      <HeartPulse size={22} className="mx-auto text-fog-dim" aria-hidden="true" />
                      <p className="mt-2 text-sm text-fog">No injuries recorded</p>
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
                              const nextList = [...field.value];
                              nextList[index] = { ...injury, area: event.target.value };
                              field.onChange(nextList);
                            }}
                            placeholder="Area"
                            options={options.injuryAreas}
                          />
                          <Select
                            aria-label="Severity"
                            value={injury.severity}
                            onChange={(event) => {
                              const nextList = [...field.value];
                              nextList[index] = { ...injury, severity: event.target.value };
                              field.onChange(nextList);
                            }}
                            placeholder="Severity"
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
                          placeholder="Notes (optional) — e.g. avoid deep knee flexion"
                          maxLength={300}
                          value={injury.notes ?? ''}
                          onChange={(event) => {
                            const nextList = [...field.value];
                            nextList[index] = { ...injury, notes: event.target.value };
                            field.onChange(nextList);
                          }}
                        />
                      </li>
                    ))}
                  </ul>

                  <Button
                    type="button"
                    variant="outline"
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
          )}

          {/* ------------------------------------------------- 6. Review */}
          {currentStep.id === 'review' && (
            <div className="space-y-6">
              <p className="text-sm text-fog">
                These targets are computed from published formulas — not generated by
                AI. Nothing has been saved yet.
              </p>

              {previewing ? (
                <Spinner label="Calculating your targets" />
              ) : preview ? (
                <TargetsPanel targets={preview} compact />
              ) : (
                <div className="panel p-5 text-sm text-fog">
                  Couldn&apos;t compute a preview — check the earlier steps.
                </div>
              )}

              <dl className="grid gap-4 border-t border-line pt-6 sm:grid-cols-2">
                {[
                  ['Goal', options.goals.find((g) => g.value === getValues('goal'))?.label],
                  ['Split', options.splits.find((s) => s.value === getValues('preferredSplit'))?.label],
                  ['Training days', `${getValues('trainingDaysPerWeek')} per week`],
                  ['Diet', humanise(getValues('dietType'))],
                  ['Meals per day', getValues('mealsPerDay')],
                  ['Equipment', `${getValues('availableEquipment')?.length ?? 0} types`],
                  ['Allergies', getValues('allergies')?.join(', ') || 'None'],
                  ['Injuries', injuries?.length ? `${injuries.length} recorded` : 'None'],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="eyebrow">{label}</dt>
                    <dd className="mt-1 truncate font-semibold">{value || '—'}</dd>
                  </div>
                ))}
              </dl>

              {submitError && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl border border-ember/30 bg-ember/8 p-3.5 text-sm text-ember"
                >
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{submitError}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={back}
            disabled={step === 0}
            className="order-2 sm:order-1"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Back
          </Button>

          {isReview ? (
            <Button type="submit" size="lg" loading={submitting} className="order-1 sm:order-2">
              Save profile &amp; finish
              <Check size={18} aria-hidden="true" />
            </Button>
          ) : (
            <Button type="button" size="lg" onClick={next} className="order-1 sm:order-2">
              Continue
              <ArrowRight size={18} aria-hidden="true" />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
};
