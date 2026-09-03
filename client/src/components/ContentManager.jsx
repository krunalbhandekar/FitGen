import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Apple,
  Check,
  Dumbbell,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { Badge, Button, cx, Spinner } from './ui';
import { Field, humanise, Select, TagInput, TextInput, NumberInput } from './form';

/**
 * Admin CRUD over the exercise and food collections.
 *
 * These two collections are what the AI generators are grounded against, so an
 * edit here changes what plans can contain. Two consequences shape this UI:
 *
 *  - Slugs are shown but never editable. A slug is the grounding handle stored
 *    inside every generated plan and workout log; renaming it would orphan those
 *    references silently. A rename is a delete plus a create, deliberately.
 *  - Delete is blocked server-side while anything references the record, and the
 *    refusal is surfaced with the reference counts rather than a generic error,
 *    because "why can't I delete this" is otherwise unanswerable from the UI.
 *
 * Validation lives on the server (`contentSchemas.js`); this form submits and
 * renders whatever field errors come back rather than duplicating the rules,
 * so the two can't drift.
 */

const FOOD_CATEGORIES = [
  'protein',
  'grain',
  'legume',
  'vegetable',
  'fruit',
  'dairy',
  'fat',
  'nut_seed',
  'beverage',
  'supplement',
  'prepared',
];

const DIET_TAGS = ['vegetarian', 'eggetarian', 'vegan', 'gluten_free', 'keto'];
const LEVELS = ['beginner', 'intermediate', 'expert'];
const FORCES = ['push', 'pull', 'static'];
const MECHANICS = ['compound', 'isolation'];

const EMPTY_EXERCISE = {
  slug: '',
  name: '',
  level: 'beginner',
  force: '',
  mechanic: '',
  equipment: '',
  category: '',
  primaryMuscles: [],
  secondaryMuscles: [],
  instructions: [],
  demoUrl: '',
};

const EMPTY_FOOD = {
  slug: '',
  name: '',
  category: 'protein',
  per: '100g',
  calories: '',
  protein: '',
  carbs: '',
  fats: '',
  fiber: '',
  servingLabel: '',
  servingGrams: '',
  dietTags: [],
  allergens: [],
};

/* ------------------------------------------------------------------ helpers */

/**
 * Fields whose schema is `.nullish()`, so emptying the control means "unset".
 *
 * Everything else is pruned when blank, which the server reads as "not
 * provided". For these two that would make clearing impossible — the field
 * would simply be absent from the PATCH and keep its old value — so an empty
 * selection is sent as an explicit null instead.
 */
const NULLABLE = new Set(['force', 'mechanic']);

/** Strips blank optional fields so the server sees absence, not empty strings. */
const prune = (payload) =>
  Object.fromEntries(
    Object.entries(payload)
      .filter(([key, value]) => {
        if (NULLABLE.has(key)) return true;
        if (value === '' || value == null) return false;
        if (Array.isArray(value) && value.length === 0) return false;
        return true;
      })
      .map(([key, value]) =>
        NULLABLE.has(key) && (value === '' || value == null) ? [key, null] : [key, value],
      ),
  );

/**
 * Only the fields the admin actually changed.
 *
 * PATCH bodies are diffed rather than sent whole so an untouched record isn't
 * rewritten field-by-field — and so the server's "no fields to update" guard
 * still fires when nothing was edited.
 */
const changedFields = (draft, original) => {
  const diff = {};
  for (const [key, value] of Object.entries(draft)) {
    if (key === 'slug') continue;
    const before = original[key];
    const same = Array.isArray(value)
      ? JSON.stringify(value) === JSON.stringify(before ?? [])
      : String(value ?? '') === String(before ?? '');
    if (!same) diff[key] = value;
  }
  return diff;
};

/* -------------------------------------------------------------------- form */

const ExerciseFields = ({ draft, set, errors, editing }) => (
  <div className="grid gap-4 sm:grid-cols-2">
    <Field
      label="Slug"
      htmlFor="ex-slug"
      required
      error={errors.slug}
      hint={
        editing
          ? 'Fixed — plans and logs reference this. Delete and recreate to rename.'
          : 'Permanent identifier, e.g. barbell_bench_press'
      }
    >
      <TextInput
        id="ex-slug"
        value={draft.slug}
        disabled={editing}
        error={errors.slug}
        onChange={(e) => set('slug', e.target.value)}
        className={editing ? 'opacity-60' : undefined}
      />
    </Field>

    <Field label="Name" htmlFor="ex-name" required error={errors.name}>
      <TextInput
        id="ex-name"
        value={draft.name}
        error={errors.name}
        onChange={(e) => set('name', e.target.value)}
      />
    </Field>

    <Field label="Equipment" htmlFor="ex-equipment" required error={errors.equipment}>
      <TextInput
        id="ex-equipment"
        value={draft.equipment}
        error={errors.equipment}
        placeholder="barbell"
        onChange={(e) => set('equipment', e.target.value)}
      />
    </Field>

    <Field label="Category" htmlFor="ex-category" required error={errors.category}>
      <TextInput
        id="ex-category"
        value={draft.category}
        error={errors.category}
        placeholder="strength"
        onChange={(e) => set('category', e.target.value)}
      />
    </Field>

    <Field label="Level" htmlFor="ex-level" required error={errors.level}>
      <Select
        id="ex-level"
        value={draft.level}
        options={LEVELS}
        error={errors.level}
        onChange={(e) => set('level', e.target.value)}
      />
    </Field>

    <Field label="Mechanic" htmlFor="ex-mechanic" error={errors.mechanic}>
      <Select
        id="ex-mechanic"
        value={draft.mechanic}
        options={MECHANICS}
        placeholder="Not specified"
        error={errors.mechanic}
        onChange={(e) => set('mechanic', e.target.value)}
      />
    </Field>

    <Field label="Force" htmlFor="ex-force" error={errors.force}>
      <Select
        id="ex-force"
        value={draft.force}
        options={FORCES}
        placeholder="Not specified"
        error={errors.force}
        onChange={(e) => set('force', e.target.value)}
      />
    </Field>

    <Field label="Demo URL" htmlFor="ex-demo" error={errors.demoUrl}>
      <TextInput
        id="ex-demo"
        value={draft.demoUrl}
        error={errors.demoUrl}
        placeholder="https://…"
        onChange={(e) => set('demoUrl', e.target.value)}
      />
    </Field>

    <div className="sm:col-span-2">
      <Field
        label="Primary muscles"
        required
        error={errors.primaryMuscles}
        hint="The injury filter routes around these, so they must be accurate."
      >
        <TagInput
          value={draft.primaryMuscles}
          onChange={(v) => set('primaryMuscles', v)}
          placeholder="chest"
          max={10}
        />
      </Field>
    </div>

    <div className="sm:col-span-2">
      <Field label="Secondary muscles" error={errors.secondaryMuscles}>
        <TagInput
          value={draft.secondaryMuscles}
          onChange={(v) => set('secondaryMuscles', v)}
          placeholder="triceps"
          max={10}
        />
      </Field>
    </div>

    <div className="sm:col-span-2">
      <Field
        label="Instructions"
        error={errors.instructions}
        hint="One step per entry, in order."
      >
        <TagInput
          value={draft.instructions}
          onChange={(v) => set('instructions', v)}
          placeholder="Add a step and press Enter"
          max={20}
        />
      </Field>
    </div>
  </div>
);

const FoodFields = ({ draft, set, errors, editing }) => (
  <div className="grid gap-4 sm:grid-cols-2">
    <Field
      label="Slug"
      htmlFor="fd-slug"
      required
      error={errors.slug}
      hint={
        editing
          ? 'Fixed — stored diet plans reference this.'
          : 'Lowercase and hyphens, e.g. paneer-low-fat'
      }
    >
      <TextInput
        id="fd-slug"
        value={draft.slug}
        disabled={editing}
        error={errors.slug}
        onChange={(e) => set('slug', e.target.value)}
        className={editing ? 'opacity-60' : undefined}
      />
    </Field>

    <Field label="Name" htmlFor="fd-name" required error={errors.name}>
      <TextInput
        id="fd-name"
        value={draft.name}
        error={errors.name}
        onChange={(e) => set('name', e.target.value)}
      />
    </Field>

    <Field label="Category" htmlFor="fd-category" required error={errors.category}>
      <Select
        id="fd-category"
        value={draft.category}
        options={FOOD_CATEGORIES}
        error={errors.category}
        onChange={(e) => set('category', e.target.value)}
      />
    </Field>

    <Field
      label="Measured per"
      htmlFor="fd-per"
      error={errors.per}
      hint="Liquids are stored per 100 ml."
    >
      <Select
        id="fd-per"
        value={draft.per}
        options={[
          { value: '100g', label: '100 g' },
          { value: '100ml', label: '100 ml' },
        ]}
        error={errors.per}
        onChange={(e) => set('per', e.target.value)}
      />
    </Field>

    {/*
     * Macros are per 100 g/ml, and the server checks them against the 4/4/9
     * arithmetic — a swapped protein/carb column is rejected rather than
     * silently distorting every diet plan the food lands in.
     */}
    <div className="sm:col-span-2">
      <p className="eyebrow mb-3 border-t border-line pt-4">
        Nutrition per {draft.per === '100ml' ? '100 ml' : '100 g'}
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Calories" htmlFor="fd-kcal" required error={errors.calories}>
          <NumberInput
            id="fd-kcal"
            unit="kcal"
            value={draft.calories}
            error={errors.calories}
            onChange={(e) => set('calories', e.target.value)}
          />
        </Field>
        <Field label="Protein" htmlFor="fd-protein" required error={errors.protein}>
          <NumberInput
            id="fd-protein"
            unit="g"
            value={draft.protein}
            error={errors.protein}
            onChange={(e) => set('protein', e.target.value)}
          />
        </Field>
        <Field label="Carbs" htmlFor="fd-carbs" required error={errors.carbs}>
          <NumberInput
            id="fd-carbs"
            unit="g"
            value={draft.carbs}
            error={errors.carbs}
            onChange={(e) => set('carbs', e.target.value)}
          />
        </Field>
        <Field label="Fats" htmlFor="fd-fats" required error={errors.fats}>
          <NumberInput
            id="fd-fats"
            unit="g"
            value={draft.fats}
            error={errors.fats}
            onChange={(e) => set('fats', e.target.value)}
          />
        </Field>
        <Field label="Fibre" htmlFor="fd-fiber" error={errors.fiber}>
          <NumberInput
            id="fd-fiber"
            unit="g"
            value={draft.fiber}
            error={errors.fiber}
            onChange={(e) => set('fiber', e.target.value)}
          />
        </Field>
      </div>
    </div>

    <Field
      label="Serving label"
      htmlFor="fd-serving"
      error={errors.servingLabel}
      hint="How a portion is described, e.g. “1 medium bowl”."
    >
      <TextInput
        id="fd-serving"
        value={draft.servingLabel}
        error={errors.servingLabel}
        onChange={(e) => set('servingLabel', e.target.value)}
      />
    </Field>

    <Field label="Serving grams" htmlFor="fd-serving-g" error={errors.servingGrams}>
      <NumberInput
        id="fd-serving-g"
        unit="g"
        value={draft.servingGrams}
        error={errors.servingGrams}
        onChange={(e) => set('servingGrams', e.target.value)}
      />
    </Field>

    <div className="sm:col-span-2">
      <Field
        label="Diet tags"
        error={errors.dietTags}
        hint="Drives the dietary-preference filter — an incorrect tag can put meat in a vegan plan."
      >
        <div className="flex flex-wrap gap-2">
          {DIET_TAGS.map((tag) => {
            const on = draft.dietTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  set(
                    'dietTags',
                    on
                      ? draft.dietTags.filter((t) => t !== tag)
                      : [...draft.dietTags, tag],
                  )
                }
                className={cx(
                  'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
                  on
                    ? 'border-volt bg-volt text-ink'
                    : 'border-line text-fog hover:border-line-bright hover:text-chalk',
                )}
              >
                {humanise(tag)}
              </button>
            );
          })}
        </div>
      </Field>
    </div>

    <div className="sm:col-span-2">
      <Field
        label="Allergens"
        error={errors.allergens}
        hint="Matched against the allergies on a user's profile to exclude this food."
      >
        <TagInput
          value={draft.allergens}
          onChange={(v) => set('allergens', v)}
          placeholder="dairy"
          max={10}
        />
      </Field>
    </div>
  </div>
);

/* -------------------------------------------------------------- editor card */

const Editor = ({ kind, record, onCancel, onSaved }) => {
  const editing = Boolean(record);
  const blank = kind === 'exercise' ? EMPTY_EXERCISE : EMPTY_FOOD;

  const [draft, setDraft] = useState(() =>
    // Merge onto the blank so a record missing an optional field still gets a
    // controlled value rather than React switching the input to uncontrolled.
    editing
      ? Object.fromEntries(
          Object.entries(blank).map(([key, fallback]) => [
            key,
            record[key] ?? fallback,
          ]),
        )
      : blank,
  );
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState(null);

  const set = (key, value) => {
    setDraft((current) => ({ ...current, [key]: value }));
    // Clear the field's error as soon as it's touched; a stale message next to a
    // field the user has just fixed reads as though the fix didn't take.
    setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    setBanner(null);

    const path = kind === 'exercise' ? 'exercises' : 'foods';

    try {
      if (editing) {
        const diff = changedFields(draft, record);
        if (Object.keys(diff).length === 0) {
          setBanner('Nothing changed.');
          setSaving(false);
          return;
        }
        await api.patch(
          `/admin/${path}/${encodeURIComponent(record.slug)}`,
          prune(diff),
        );
      } else {
        await api.post(`/admin/${path}`, prune(draft));
      }
      onSaved(editing ? 'Saved.' : 'Created.');
    } catch (err) {
      // `details` is the server's per-field map; anything else is a banner.
      if (err.details && typeof err.details === 'object') setErrors(err.details);
      setBanner(err.message);
    } finally {
      setSaving(false);
    }
  };

  const Fields = kind === 'exercise' ? ExerciseFields : FoodFields;

  return (
    <form onSubmit={submit} className="panel p-5 sm:p-6" noValidate>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">{editing ? 'Edit' : 'New'}</p>
          <h3 className="display-md mt-1.5">
            {editing ? record.name : `Add ${kind === 'exercise' ? 'an exercise' : 'a food'}`}
          </h3>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          <X size={14} aria-hidden="true" />
          Cancel
        </Button>
      </div>

      {banner && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2.5 rounded-xl border border-ember/30 bg-ember/8 p-3.5 text-sm text-ember"
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{banner}</span>
        </div>
      )}

      <div className="mt-5">
        <Fields draft={draft} set={set} errors={errors} editing={editing} />
      </div>

      <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-5">
        <Button type="submit" loading={saving}>
          {editing ? 'Save changes' : 'Create'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Discard
        </Button>
      </div>
    </form>
  );
};

/* ------------------------------------------------------------ delete prompt */

/**
 * Two-step delete.
 *
 * The usage count is fetched before confirming, so the admin is told the delete
 * will be refused *before* trying it — rather than the refusal being the first
 * they hear of the references.
 */
const DeletePrompt = ({ kind, record, onCancel, onDeleted }) => {
  const [usage, setUsage] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const path = kind === 'exercise' ? 'exercises' : 'foods';

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/admin/${path}/${encodeURIComponent(record.slug)}/usage`)
      .then(({ data }) => {
        if (!cancelled) setUsage(data.data.usage);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [path, record.slug]);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/admin/${path}/${encodeURIComponent(record.slug)}`);
      onDeleted(`Deleted “${record.name}”.`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const blocked = usage != null && usage.total > 0;

  return (
    <div className="panel border-ember/30 p-5">
      <p className="font-bold">Delete “{record.name}”?</p>

      {usage == null && !error && (
        <p className="mt-2 text-sm text-fog">Checking what references it…</p>
      )}

      {blocked && (
        <p className="mt-2 text-sm text-ember">
          In use by {usage.total} record{usage.total === 1 ? '' : 's'}. Deleting it
          would leave stored plans and logs unreadable, so it can't be removed —
          edit it instead.
        </p>
      )}

      {usage != null && !blocked && (
        <p className="mt-2 text-sm text-fog">
          Nothing references it. This is permanent and can't be undone.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-ember">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="danger"
          size="sm"
          loading={busy}
          disabled={usage == null || blocked}
          onClick={confirm}
        >
          <Trash2 size={14} aria-hidden="true" />
          Delete permanently
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Keep it
        </Button>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------- panel */

const TABS = [
  { key: 'exercise', label: 'Exercises', icon: Dumbbell, endpoint: '/exercises' },
  { key: 'food', label: 'Foods', icon: Apple, endpoint: '/foods' },
];

export const ContentManager = ({ onChanged }) => {
  const [kind, setKind] = useState('exercise');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState(null); // 'create' | 'edit' | 'delete'
  const [target, setTarget] = useState(null);
  const [flash, setFlash] = useState(null);
  const editorRef = useRef(null);

  const tab = TABS.find((t) => t.key === kind);

  /*
   * The editor opens above the list, so acting on a row far down the page would
   * otherwise look like nothing happened. `block: 'nearest'` keeps the jump to
   * the minimum needed, and the animation is dropped for anyone who has asked
   * to reduce motion.
   */
  useEffect(() => {
    if (!mode) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    editorRef.current?.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'nearest',
    });
  }, [mode, target?.slug]);

  const load = useCallback(async () => {
    setRows(null);
    setError(null);
    try {
      const { data } = await api.get(tab.endpoint, {
        params: { search: search.trim() || undefined, limit: 20 },
      });
      setRows(data.data);
      // The two list endpoints envelope their count differently — exercises are
      // paginated, foods are capped — so read whichever one is present.
      setTotal(data.pagination?.total ?? data.meta?.total ?? data.data.length);
    } catch (err) {
      setError(err.message);
    }
  }, [tab.endpoint, search]);

  // Debounced so typing in the search box doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  const close = () => {
    setMode(null);
    setTarget(null);
  };

  const afterWrite = (message) => {
    close();
    setFlash(message);
    load();
    // The admin stat cards count these collections, so they're stale now.
    onChanged?.();
  };

  return (
    <section className="space-y-4" aria-labelledby="content-heading">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Content</p>
          <h2 id="content-heading" className="display-md mt-1.5">
            Exercise &amp; food library
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-fog">
            The AI generators can only pick from these two collections, so what is
            here defines what any plan can contain.
          </p>
        </div>

        {!mode && (
          <Button
            onClick={() => {
              setTarget(null);
              setMode('create');
            }}
          >
            <Plus size={16} aria-hidden="true" />
            Add {kind}
          </Button>
        )}
      </div>

      {flash && (
        <div className="panel flex items-center gap-3 p-3.5">
          <Check size={15} className="shrink-0 text-volt" aria-hidden="true" />
          <p className="text-sm text-fog">{flash}</p>
          <button
            type="button"
            onClick={() => setFlash(null)}
            aria-label="Dismiss"
            className="ml-auto text-fog-dim hover:text-chalk"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}

      {/*
       * Keyed on the record being edited. The editor seeds its draft from
       * `record` in a `useState` initialiser, which runs only on mount — so
       * without a key, clicking Edit on a second row would reuse the mounted
       * instance and keep the first row's values while the slug it saves to
       * points at the second. The key forces a remount per record.
       */}
      <div ref={editorRef}>
        {mode === 'create' && (
          <Editor
            key={`create-${kind}`}
            kind={kind}
            record={null}
            onCancel={close}
            onSaved={afterWrite}
          />
        )}
        {mode === 'edit' && target && (
          <Editor
            key={`edit-${kind}-${target.slug}`}
            kind={kind}
            record={target}
            onCancel={close}
            onSaved={afterWrite}
          />
        )}
        {mode === 'delete' && target && (
          <DeletePrompt
            key={`delete-${kind}-${target.slug}`}
            kind={kind}
            record={target}
            onCancel={close}
            onDeleted={afterWrite}
          />
        )}
      </div>

      <div className="panel p-5 sm:p-6">
        {/* Collection switch + search, one row, as the filter guidance calls for */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div
            role="tablist"
            aria-label="Collection"
            className="flex shrink-0 rounded-xl border border-line p-1"
          >
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                role="tab"
                type="button"
                aria-selected={kind === key}
                onClick={() => {
                  setKind(key);
                  close();
                  setSearch('');
                }}
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
                  kind === key
                    ? 'bg-volt text-ink'
                    : 'text-fog hover:text-chalk',
                )}
              >
                <Icon size={14} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>

          <div className="relative min-w-0 flex-1">
            <Search
              size={15}
              className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-fog-dim"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Search ${tab.label.toLowerCase()} by name`}
              aria-label={`Search ${tab.label.toLowerCase()}`}
              className="h-11 w-full rounded-xl border border-line bg-panel pr-3.5 pl-10 text-sm text-chalk transition-colors placeholder:text-fog-dim focus:border-volt focus:outline-none"
            />
          </div>
        </div>

        {error ? (
          <p role="alert" className="mt-5 text-sm text-ember">
            {error}
          </p>
        ) : rows == null ? (
          <Spinner label={`Loading ${tab.label.toLowerCase()}`} />
        ) : rows.length === 0 ? (
          <p className="mt-5 rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-fog-dim">
            {search ? `Nothing matching “${search}”.` : 'This collection is empty.'}
          </p>
        ) : (
          <>
            <ul className="mt-5 divide-y divide-line">
              {rows.map((row) => (
                <li
                  key={row.slug}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{row.name}</p>
                    <p className="mt-0.5 truncate text-xs text-fog-dim">
                      {kind === 'exercise'
                        ? `${row.slug} · ${humanise(row.equipment)} · ${row.primaryMuscles?.join(', ')}`
                        : `${row.slug} · ${row.calories} kcal · P ${row.protein} / C ${row.carbs} / F ${row.fats} per ${row.per === '100ml' ? '100 ml' : '100 g'}`}
                    </p>
                  </div>

                  <Badge>
                    {kind === 'exercise' ? row.level : humanise(row.category)}
                  </Badge>

                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setTarget(row);
                        setMode('edit');
                      }}
                      aria-label={`Edit ${row.name}`}
                      className="grid size-9 place-items-center rounded-lg border border-line text-fog transition-colors hover:border-volt hover:text-volt"
                    >
                      <Pencil size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTarget(row);
                        setMode('delete');
                      }}
                      aria-label={`Delete ${row.name}`}
                      className="grid size-9 place-items-center rounded-lg border border-line text-fog transition-colors hover:border-ember hover:text-ember"
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <p className="mt-4 text-xs text-fog-dim">
              Showing {rows.length} of {total}. Narrow with search to reach the rest.
            </p>
          </>
        )}
      </div>
    </section>
  );
};
