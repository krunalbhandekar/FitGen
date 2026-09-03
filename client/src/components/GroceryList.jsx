import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Download, ShoppingCart } from 'lucide-react';
import { api } from '../lib/api';
import { Button, cx, ErrorState, Spinner } from './ui';
import { exportGroceryListPdf } from '../lib/pdf';
import { usePdfExport } from '../hooks/usePdfExport';

/**
 * Grocery list built from the active diet plan.
 *
 * A generated plan covers one day intended to be repeated, so the day count is
 * a control rather than an assumption — and the chosen value is shown in the
 * heading so the list is never ambiguous about what it feeds.
 *
 * Ticking items is per-viewer convenience only and is not persisted: a shopping
 * list is transient, and syncing check state would imply it were durable.
 */

const DAY_OPTIONS = [1, 3, 7, 14];

export const GroceryList = ({ userName, onClose, refreshKey }) => {
  const [days, setDays] = useState(7);
  const [list, setList] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [ticked, setTicked] = useState(() => new Set());
  const [copied, setCopied] = useState(false);
  const pdf = usePdfExport();

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const { data } = await api.get('/plans/diet/grocery', { params: { days } });
      setList(data.data);
      /*
       * Ticks are cleared on every refetch. Quantities are aggregated across
       * the whole plan, so swapping even one meal can change the amount next to
       * an item elsewhere — and a tick against a quantity that has since moved
       * is worse than no tick at all.
       */
      setTicked(new Set());
    } catch (err) {
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  }, [days]);

  /*
   * `refreshKey` changes whenever the plan behind this list does — a
   * regeneration or a single meal swap. Without it the panel would keep showing
   * the previous plan's ingredients, which is worse than showing nothing: it is
   * a shopping list someone might actually shop from.
   */
  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const toggle = (slug) =>
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });

  const copyText = async () => {
    try {
      const { data } = await api.get('/plans/diet/grocery', {
        params: { days, format: 'text' },
        // The endpoint returns text/plain, not JSON.
        transformResponse: [(raw) => raw],
      });
      await navigator.clipboard.writeText(data);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError(err.message);
    }
  };

  /*
   * Error first: once a fetch has failed we cannot claim to know the current
   * list, even if a previous one is still in state. Then the empty case. A
   * refetch that already has a list to show dims it in place instead, so a meal
   * swap does not make the whole panel vanish and reappear.
   */
  if (error) {
    return (
      <div className="panel p-5">
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }
  if (!list) return <Spinner label="Building your list" />;

  const totalItems = list.groups.reduce((sum, g) => sum + g.items.length, 0);

  return (
    /* aria-busy so a screen reader hears the list is being rebuilt, rather than
       silently reading out quantities that are mid-change. */
    <section
      className="panel p-5 sm:p-6"
      aria-labelledby="grocery-heading"
      aria-busy={refreshing || undefined}
    >
      <div
        className={cx(
          'transition-opacity',
          refreshing && 'pointer-events-none opacity-50',
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow flex items-center gap-1.5">
              <ShoppingCart size={12} aria-hidden="true" />
              Shopping
            </p>
            <h2 id="grocery-heading" className="display-md mt-1.5">
              {list.days} day{list.days === 1 ? '' : 's'} of food
            </h2>
            <p className="mt-1 text-sm text-fog">
              {totalItems} items · about {list.summary.caloriesPerDay} kcal a day ·{' '}
              {ticked.size} ticked
            </p>
          </div>

          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Hide
            </Button>
          )}
        </div>

        {/* Day count */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="text-xs text-fog-dim">Shopping for</span>
          {DAY_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={days === option}
              onClick={() => setDays(option)}
              className={cx(
                'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
                days === option
                  ? 'border-volt bg-volt text-ink'
                  : 'border-line text-fog hover:border-line-bright hover:text-chalk',
              )}
            >
              {option} day{option === 1 ? '' : 's'}
            </button>
          ))}
        </div>

        {/* Aisles */}
        <div className="mt-6 space-y-5">
          {list.groups.map((group) => (
            <div key={group.aisle}>
              <h3 className="eyebrow border-b border-line pb-2">{group.aisle}</h3>
              <ul className="mt-2">
                {group.items.map((item) => {
                  const done = ticked.has(item.slug);
                  return (
                    <li key={item.slug}>
                      <button
                        type="button"
                        onClick={() => toggle(item.slug)}
                        aria-pressed={done}
                        className="flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left transition-colors hover:bg-panel-2"
                      >
                        <span
                          className={cx(
                            'grid size-4.5 shrink-0 place-items-center rounded border transition-colors',
                            done
                              ? 'border-volt bg-volt text-ink'
                              : 'border-line-bright text-transparent',
                          )}
                          aria-hidden="true"
                        >
                          <Check size={11} strokeWidth={3} />
                        </span>

                        <span
                          className={cx(
                            'min-w-0 flex-1 text-sm',
                            done ? 'text-fog-dim line-through' : 'text-chalk',
                          )}
                        >
                          {item.name}
                          {item.usedIn.length > 1 && (
                            <span className="ml-1.5 text-[0.625rem] text-fog-dim">
                              ({item.usedIn.length} meals)
                            </span>
                          )}
                        </span>

                        <span
                          className={cx(
                            'shrink-0 text-sm font-semibold tabular-nums',
                            done ? 'text-fog-dim' : 'text-volt',
                          )}
                        >
                          {item.purchase.amount}
                          {item.purchase.unit}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-5">
          <Button
            variant="outline"
            size="sm"
            loading={pdf.busy}
            onClick={() => pdf.run(() => exportGroceryListPdf(list, { userName }))}
          >
            <Download size={14} aria-hidden="true" />
            Download PDF
          </Button>
          <Button variant="ghost" size="sm" onClick={copyText}>
            {copied ? (
              <>
                <Check size={14} aria-hidden="true" />
                Copied
              </>
            ) : (
              <>
                <Copy size={14} aria-hidden="true" />
                Copy as text
              </>
            )}
          </Button>
        </div>

        {pdf.error && (
          <p role="alert" className="mt-3 text-xs text-ember">
            {pdf.error}
          </p>
        )}

        <p className="mt-3 text-xs text-fog-dim">
          Quantities round up to practical shopping amounts, so they slightly exceed
          what the plan needs. Ticks are not saved.
        </p>
      </div>
    </section>
  );
};
