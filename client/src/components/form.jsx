import { useId, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { cx } from './ui';

/** Turns `lower_back` / `loseFat` into `Lower back` / `Lose fat`. */
export const humanise = (value = '') =>
  String(value)
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (char) => char.toUpperCase());

/* ------------------------------------------------------------------- Field */

export const Field = ({ label, error, hint, required, htmlFor, children }) => (
  <div>
    {label && (
      <label
        htmlFor={htmlFor}
        className="mb-2 block text-sm font-semibold text-chalk"
      >
        {label}
        {required && (
          <span className="ml-1 text-ember" aria-hidden="true">
            *
          </span>
        )}
      </label>
    )}
    {children}
    {error ? (
      <p role="alert" className="mt-1.5 text-xs text-ember">
        {error}
      </p>
    ) : hint ? (
      <p className="mt-1.5 text-xs text-fog-dim">{hint}</p>
    ) : null}
  </div>
);

const inputBase =
  'h-11 w-full rounded-xl border bg-panel px-3.5 text-sm text-chalk placeholder:text-fog-dim focus:outline-none transition-colors';

const borderFor = (error) =>
  error ? 'border-ember/60 focus:border-ember' : 'border-line focus:border-volt';

/* -------------------------------------------------------------- TextInput */

export const TextInput = ({ error, className, ...props }) => (
  <input
    className={cx(inputBase, borderFor(error), className)}
    aria-invalid={error ? true : undefined}
    {...props}
  />
);

/**
 * Numeric input with a unit suffix. `inputMode="decimal"` gets phones to show
 * a numeric keypad without blocking a decimal point the way type="number" can.
 */
export const NumberInput = ({ error, unit, className, ...props }) => (
  <div className="relative">
    <input
      type="number"
      inputMode="decimal"
      className={cx(inputBase, borderFor(error), unit && 'pr-12', className)}
      aria-invalid={error ? true : undefined}
      {...props}
    />
    {unit && (
      <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-xs font-semibold text-fog-dim">
        {unit}
      </span>
    )}
  </div>
);

/* ----------------------------------------------------------------- Select */

export const Select = ({ error, options, placeholder, className, ...props }) => (
  <select
    className={cx(inputBase, borderFor(error), 'appearance-none pr-9', className)}
    aria-invalid={error ? true : undefined}
    style={{
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239ba1ac' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'right 0.75rem center',
      backgroundSize: '1.1rem',
    }}
    {...props}
  >
    {placeholder && (
      <option value="">{placeholder}</option>
    )}
    {options.map((option) => {
      const value = typeof option === 'string' ? option : option.value;
      const label = typeof option === 'string' ? humanise(option) : option.label;
      return (
        <option key={value} value={value}>
          {label}
        </option>
      );
    })}
  </select>
);

/* ------------------------------------------------------- SegmentedControl */

/** Compact radio group for 2–4 short options (e.g. gender). */
export const SegmentedControl = ({ value, onChange, options, name }) => (
  <div
    role="radiogroup"
    aria-label={name}
    className="grid grid-cols-3 gap-1.5 rounded-xl border border-line bg-panel p-1.5"
  >
    {options.map((option) => {
      const optionValue = typeof option === 'string' ? option : option.value;
      const label = typeof option === 'string' ? humanise(option) : option.label;
      const active = value === optionValue;

      return (
        <button
          key={optionValue}
          type="button"
          role="radio"
          aria-checked={active}
          onClick={() => onChange(optionValue)}
          className={cx(
            'h-9 rounded-lg text-sm font-semibold transition-colors',
            active ? 'bg-volt text-ink' : 'text-fog hover:bg-panel-2 hover:text-chalk',
          )}
        >
          {label}
        </button>
      );
    })}
  </div>
);

/* ----------------------------------------------------------- OptionCards */

/**
 * Radio cards for options that need explaining (goals, activity levels,
 * splits). Stacks on mobile, two columns from `sm`.
 */
export const OptionCards = ({ value, onChange, options, name, columns = 2 }) => (
  <div
    role="radiogroup"
    aria-label={name}
    className={cx('grid gap-2.5', columns === 2 ? 'sm:grid-cols-2' : '')}
  >
    {options.map((option) => {
      const active = value === option.value;
      return (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={active}
          onClick={() => onChange(option.value)}
          className={cx(
            'rounded-xl border p-4 text-left transition-colors',
            active
              ? 'border-volt bg-volt/8'
              : 'border-line bg-panel hover:border-line-bright',
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <span
              className={cx('font-bold', active ? 'text-volt' : 'text-chalk')}
            >
              {option.label}
            </span>
            {active && (
              <Check size={16} className="mt-0.5 shrink-0 text-volt" aria-hidden="true" />
            )}
          </div>
          {option.description && (
            <p className="mt-1 text-xs leading-relaxed text-fog">
              {option.description}
            </p>
          )}
        </button>
      );
    })}
  </div>
);

/* ------------------------------------------------------- ChipMultiSelect */

export const ChipMultiSelect = ({ value = [], onChange, options, name }) => {
  const toggle = (option) =>
    onChange(
      value.includes(option)
        ? value.filter((entry) => entry !== option)
        : [...value, option],
    );

  return (
    <div role="group" aria-label={name} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = value.includes(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => toggle(option)}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors',
              active
                ? 'border-volt bg-volt text-ink'
                : 'border-line text-fog hover:border-line-bright hover:text-chalk',
            )}
          >
            {active && <Check size={13} aria-hidden="true" />}
            {humanise(option)}
          </button>
        );
      })}
    </div>
  );
};

/* -------------------------------------------------------------- TagInput */

/** Free-text list builder for allergies / disliked foods. */
export const TagInput = ({ value = [], onChange, placeholder, max = 25 }) => {
  const [draft, setDraft] = useState('');
  const inputId = useId();

  const add = () => {
    const entry = draft.trim().toLowerCase();
    if (!entry) return;
    if (value.some((v) => v.toLowerCase() === entry)) {
      setDraft('');
      return;
    }
    if (value.length >= max) return;
    onChange([...value, entry]);
    setDraft('');
  };

  const remove = (entry) => onChange(value.filter((v) => v !== entry));

  return (
    <div>
      <div className="flex gap-2">
        <input
          id={inputId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter must not submit the surrounding wizard form.
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className={cx(inputBase, borderFor(false))}
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim() || value.length >= max}
          aria-label="Add"
          className="grid size-11 shrink-0 place-items-center rounded-xl border border-line text-fog transition-colors hover:border-volt hover:text-volt disabled:opacity-40"
        >
          <Plus size={16} aria-hidden="true" />
        </button>
      </div>

      {value.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {value.map((entry) => (
            <li key={entry}>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel-2 py-1.5 pr-1.5 pl-3 text-sm">
                {entry}
                <button
                  type="button"
                  onClick={() => remove(entry)}
                  aria-label={`Remove ${entry}`}
                  className="grid size-5 place-items-center rounded-full text-fog-dim transition-colors hover:bg-ember/20 hover:text-ember"
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
