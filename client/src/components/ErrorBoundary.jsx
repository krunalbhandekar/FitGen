import { Component } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

/**
 * Catches render errors anywhere below it.
 *
 * Without this, one thrown error in any component unmounts the entire React
 * tree and the user is left staring at a blank page with no explanation — the
 * worst possible failure mode, because it looks like the app is simply broken
 * rather than that one screen failed.
 *
 * Must be a class: `componentDidCatch` has no hook equivalent.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // No error-reporting service is wired up, so the console is the record.
    console.error('[FitGen] render error:', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="shell grid min-h-[70vh] place-items-center py-16">
        <div className="panel max-w-lg p-6 text-center sm:p-8">
          <span
            className="mx-auto grid size-12 place-items-center rounded-2xl bg-ember/12 text-ember"
            aria-hidden="true"
          >
            <AlertTriangle size={22} />
          </span>

          <h1 className="display-md mt-4">This screen hit a problem</h1>
          <p className="mt-3 text-sm text-fog">
            Something failed while rendering. Your data is safe — nothing was
            saved or lost by this error.
          </p>

          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-volt px-5 text-sm font-bold text-ink transition-colors hover:bg-volt-deep"
            >
              <RotateCcw size={16} aria-hidden="true" />
              Try again
            </button>
            <a
              href="/dashboard"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-line-bright px-5 text-sm font-semibold text-chalk transition-colors hover:border-volt hover:text-volt"
            >
              Back to dashboard
            </a>
          </div>

          {/* The message is developer-facing but useful in a viva or bug report. */}
          <details className="mt-6 text-left">
            <summary className="cursor-pointer text-xs text-fog-dim hover:text-chalk">
              Technical detail
            </summary>
            <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-panel-2 p-3 text-[0.6875rem] leading-relaxed text-fog">
              {error.message}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
