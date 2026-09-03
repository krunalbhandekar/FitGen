import { useCallback, useEffect, useMemo, useState } from 'react';
import { Apple, Search, X } from 'lucide-react';
import { api } from '../lib/api';
import { useDebounce } from '../hooks/useDebounce';
import { MACRO_SERIES, MacroBar } from '../components/TargetsPanel';
import {
  Badge,
  Button,
  cx,
  EmptyState,
  ErrorState,
  PageHeader,
  Spinner,
} from '../components/ui';

const CATEGORIES = [
  { value: '', label: 'All' },
  { value: 'protein', label: 'Protein' },
  { value: 'grain', label: 'Grains' },
  { value: 'legume', label: 'Legumes' },
  { value: 'vegetable', label: 'Vegetables' },
  { value: 'fruit', label: 'Fruit' },
  { value: 'dairy', label: 'Dairy' },
  { value: 'nut_seed', label: 'Nuts & seeds' },
  { value: 'fat', label: 'Fats & oils' },
  { value: 'beverage', label: 'Drinks' },
  { value: 'supplement', label: 'Supplements' },
  { value: 'prepared', label: 'Prepared meals' },
];

const DIET_TAGS = [
  { value: '', label: 'Any diet' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'eggetarian', label: 'Eggetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'keto', label: 'Keto' },
  { value: 'gluten_free', label: 'Gluten free' },
];

const Macro = ({ label, value, unit = 'g', color }) => (
  <div>
    <p className="eyebrow flex items-center gap-1">
      {color && (
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      {label}
    </p>
    <p className="mt-0.5 font-bold tabular-nums">
      {value}
      <span className="ml-0.5 text-xs font-medium text-fog-dim">{unit}</span>
    </p>
  </div>
);

const FoodCard = ({ food }) => (
  <li className="panel p-5">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="font-bold leading-snug">{food.name}</h3>
        <p className="mt-1 text-xs text-fog-dim">
          per {food.per}
          {food.servingLabel ? ` · ${food.servingLabel} = ${food.servingGrams}g` : ''}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-display text-2xl leading-none text-volt tabular-nums">
          {food.calories}
        </p>
        <p className="text-[0.625rem] tracking-wide text-fog-dim uppercase">kcal</p>
      </div>
    </div>

    <div className="mt-4">
      <MacroBar
        macros={{ protein: food.protein, carbs: food.carbs, fats: food.fats }}
        height={6}
        showLabels={false}
      />
    </div>

    <dl className="mt-3 grid grid-cols-4 gap-2">
      <Macro
        label="Protein"
        value={food.protein}
        color="var(--color-macro-protein)"
      />
      <Macro label="Carbs" value={food.carbs} color="var(--color-macro-carbs)" />
      <Macro label="Fats" value={food.fats} color="var(--color-macro-fats)" />
      <Macro label="Fiber" value={food.fiber ?? 0} />
    </dl>

    {(food.dietTags?.length > 0 || food.allergens?.length > 0) && (
      <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-3.5">
        {food.dietTags?.map((tag) => (
          <Badge key={tag} tone="volt">
            {tag.replace(/_/g, ' ')}
          </Badge>
        ))}
        {food.allergens?.map((allergen) => (
          <Badge key={allergen} tone="ember">
            {allergen.replace(/_/g, ' ')}
          </Badge>
        ))}
      </div>
    )}
  </li>
);

export const Foods = () => {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [dietTag, setDietTag] = useState('');

  const debouncedSearch = useDebounce(search);

  const query = useMemo(
    () => ({
      limit: 200,
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(category ? { category } : {}),
      ...(dietTag ? { dietTag } : {}),
    }),
    [debouncedSearch, category, dietTag],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/foods', { params: query });
      setItems(data.data);
      setTotal(data.meta.total);
    } catch (err) {
      setError(err.message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="shell space-y-8 py-8 sm:py-12">
      <PageHeader
        eyebrow="Verified library"
        title="Nutrition database"
        description="Macros per 100g for every food your diet plans can use. Values are computed, never estimated by the AI."
      />

      {/* Controls */}
      <div className="space-y-4">
        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-fog-dim"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search foods…"
            aria-label="Search foods"
            className="h-11 w-full rounded-xl border border-line bg-panel pr-10 pl-10 text-sm placeholder:text-fog-dim focus:border-volt focus:outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute top-1/2 right-3 -translate-y-1/2 text-fog-dim hover:text-chalk"
            >
              <X size={15} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Category chips — scroll horizontally on narrow screens */}
        <div
          className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
          role="group"
          aria-label="Filter by category"
        >
          {CATEGORIES.map(({ value, label }) => (
            <button
              key={value || 'all'}
              type="button"
              aria-pressed={category === value}
              onClick={() => setCategory(value)}
              className={cx(
                'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors',
                category === value
                  ? 'border-volt bg-volt text-ink'
                  : 'border-line text-fog hover:border-line-bright hover:text-chalk',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div
          className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
          role="group"
          aria-label="Filter by diet"
        >
          {DIET_TAGS.map(({ value, label }) => (
            <button
              key={value || 'any'}
              type="button"
              aria-pressed={dietTag === value}
              onClick={() => setDietTag(value)}
              className={cx(
                'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors',
                dietTag === value
                  ? 'border-chalk bg-chalk text-ink'
                  : 'border-line text-fog hover:border-line-bright hover:text-chalk',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Macro legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-fog-dim">
        {MACRO_SERIES.map((series) => (
          <span key={series.key} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-full"
              style={{ backgroundColor: series.color }}
            />
            {series.label}
          </span>
        ))}
        <span className="ml-auto">Bar shows share of calories</span>
      </div>

      {loading ? (
        <Spinner label="Loading foods" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Apple}
          title="No foods match"
          description="Try a different category, diet filter or search term."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch('');
                setCategory('');
                setDietTag('');
              }}
            >
              Reset filters
            </Button>
          }
        />
      ) : (
        <>
          <p className="text-sm text-fog-dim">
            {total} food{total === 1 ? '' : 's'}
          </p>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((food) => (
              <FoodCard key={food.slug} food={food} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
};
