import { Link } from 'react-router-dom';
import { AlertTriangle, Loader2 } from 'lucide-react';

export const cx = (...classes) => classes.filter(Boolean).join(' ');

/* ------------------------------------------------------------------ Button */

const BUTTON_VARIANTS = {
  primary:
    'bg-volt text-ink hover:bg-volt-deep active:scale-[0.98] font-bold shadow-[0_0_0_0_rgba(205,255,60,0.4)] hover:shadow-[0_6px_24px_-6px_rgba(205,255,60,0.5)]',
  outline:
    'border border-line-bright text-chalk hover:border-volt hover:text-volt active:scale-[0.98]',
  ghost: 'text-fog hover:text-chalk hover:bg-panel-2',
  danger: 'bg-ember text-white hover:brightness-110 active:scale-[0.98] font-semibold',
};

const BUTTON_SIZES = {
  sm: 'h-9 px-3.5 text-sm gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-13 px-7 text-base gap-2.5',
};

export const Button = ({
  as: Component = 'button',
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className,
  children,
  ...props
}) => (
  <Component
    className={cx(
      'inline-flex items-center justify-center rounded-xl whitespace-nowrap',
      'transition-all duration-150 select-none',
      'disabled:opacity-50 disabled:pointer-events-none',
      BUTTON_VARIANTS[variant],
      BUTTON_SIZES[size],
      className,
    )}
    disabled={Component === 'button' ? disabled || loading : undefined}
    aria-busy={loading || undefined}
    {...props}
  >
    {loading && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
    {children}
  </Component>
);

/* ------------------------------------------------------------------- Badge */

const BADGE_TONES = {
  volt: 'bg-volt/12 text-volt border-volt/25',
  neutral: 'bg-panel-2 text-fog border-line',
  ember: 'bg-ember/12 text-ember border-ember/25',
};

export const Badge = ({ tone = 'neutral', className, children }) => (
  <span
    className={cx(
      'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5',
      'text-[0.6875rem] font-semibold tracking-wide uppercase',
      BADGE_TONES[tone],
      className,
    )}
  >
    {children}
  </span>
);

/* -------------------------------------------------------------- Stat / Card */

export const StatCard = ({ icon: Icon, label, value, hint }) => (
  <div className="panel p-4 sm:p-5">
    <div className="flex items-start justify-between gap-3">
      <p className="eyebrow">{label}</p>
      {Icon && <Icon size={18} className="text-volt shrink-0" aria-hidden="true" />}
    </div>
    <p className="display-md mt-2 tabular-nums">{value}</p>
    {hint && <p className="mt-1 text-xs text-fog-dim">{hint}</p>}
  </div>
);

/* ------------------------------------------------------------------ States */

export const Spinner = ({ label = 'Loading', className }) => (
  <div className={cx('flex items-center justify-center gap-2.5 py-12', className)}>
    <Loader2 size={20} className="animate-spin text-volt" aria-hidden="true" />
    <span className="text-sm text-fog">{label}…</span>
  </div>
);

export const ErrorState = ({ message, onRetry }) => (
  <div
    role="alert"
    className="panel flex flex-col items-center gap-4 px-6 py-10 text-center"
  >
    <AlertTriangle size={28} className="text-ember" aria-hidden="true" />
    <p className="max-w-md text-sm text-fog">{message}</p>
    {onRetry && (
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    )}
  </div>
);

export const EmptyState = ({ icon: Icon, title, description, action }) => (
  <div className="panel flex flex-col items-center gap-3 px-6 py-14 text-center">
    {Icon && <Icon size={30} className="text-fog-dim" aria-hidden="true" />}
    <h3 className="display-md">{title}</h3>
    {description && <p className="max-w-sm text-sm text-fog">{description}</p>}
    {action}
  </div>
);

/* ------------------------------------------------------------- Page header */

export const PageHeader = ({ eyebrow, title, description, actions }) => (
  <header className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
      <h1 className="display-lg text-balance">{title}</h1>
      {description && (
        <p className="mt-2 max-w-2xl text-sm text-fog sm:text-base">{description}</p>
      )}
    </div>
    {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
  </header>
);

/* ------------------------------------------------------------------- Brand */

export const Logo = ({ className }) => (
  <Link
    to="/"
    className={cx('group inline-flex items-center gap-2', className)}
    aria-label="FitGen home"
  >
    <span
      className="grid size-8 shrink-0 place-items-center rounded-lg bg-volt text-ink"
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
        <rect x="1" y="9.5" width="3.5" height="5" rx="1" />
        <rect x="19.5" y="9.5" width="3.5" height="5" rx="1" />
        <rect x="5.5" y="7" width="4" height="10" rx="1.25" />
        <rect x="14.5" y="7" width="4" height="10" rx="1.25" />
        <rect x="9" y="10.75" width="6" height="2.5" />
      </svg>
    </span>
    <span className="font-display text-xl tracking-wide uppercase">
      Fit<span className="text-volt">Gen</span>
    </span>
  </Link>
);
