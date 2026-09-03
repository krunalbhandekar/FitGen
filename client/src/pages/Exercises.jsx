import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useDebounce } from '../hooks/useDebounce';
import {
  Badge,
  Button,
  cx,
  EmptyState,
  ErrorState,
  PageHeader,
  Spinner,
} from '../components/ui';

const titleCase = (value = '') =>
  value.replace(/\b\w/g, (char) => char.toUpperCase());

const LEVEL_TONE = {
  beginner: 'volt',
  intermediate: 'neutral',
  expert: 'ember',
};

/* ------------------------------------------------------------- Filter group */

const FilterGroup = ({ label, options, selected, onToggle }) => (
  <fieldset>
    <legend className="eyebrow mb-2.5">{label}</legend>
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(option)}
            className={cx(
              'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
              active
                ? 'border-volt bg-volt text-ink'
                : 'border-line text-fog hover:border-line-bright hover:text-chalk',
            )}
          >
            {titleCase(option)}
          </button>
        );
      })}
    </div>
  </fieldset>
);

/* --------------------------------------------------------------- Card */

const ExerciseCard = ({ exercise }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const image = exercise.images?.[0];

  return (
    <li>
      <Link
        to={`/exercises/${encodeURIComponent(exercise.slug)}`}
        className="panel group flex h-full flex-col overflow-hidden transition-colors hover:border-volt/50"
      >
        <div className="relative aspect-4/3 overflow-hidden bg-panel-2">
          {image && !imageFailed ? (
            <img
              src={image}
              alt={exercise.name}
              loading="lazy"
              onError={() => setImageFailed(true)}
              className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="grid size-full place-items-center" aria-hidden="true">
              <Dumbbell size={28} className="text-line-bright" />
            </div>
          )}
          {exercise.level && (
            <div className="absolute top-2.5 left-2.5">
              <Badge tone={LEVEL_TONE[exercise.level] ?? 'neutral'}>
                {exercise.level}
              </Badge>
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col p-4">
          <h3 className="font-bold leading-snug transition-colors group-hover:text-volt">
            {exercise.name}
          </h3>
          <p className="mt-1.5 text-xs text-fog">
            {titleCase(exercise.primaryMuscles?.join(', ') ?? '—')}
          </p>
          <p className="mt-auto pt-3 text-[0.6875rem] tracking-wide text-fog-dim uppercase">
            {titleCase(exercise.equipment ?? 'no equipment')}
            {exercise.mechanic ? ` · ${titleCase(exercise.mechanic)}` : ''}
          </p>
        </div>
      </Link>
    </li>
  );
};

/* --------------------------------------------------------------- Page */

const PAGE_SIZE = 24;

export const Exercises = () => {
  const [filters, setFilters] = useState(null);
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const [search, setSearch] = useState('');
  const [muscle, setMuscle] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [level, setLevel] = useState([]);
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebounce(search);

  // Load filter vocabulary once.
  useEffect(() => {
    api
      .get('/exercises/filters')
      .then(({ data }) => setFilters(data.data))
      .catch(() => setFilters({ muscles: [], equipment: [], levels: [] }));
  }, []);

  const query = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(muscle.length ? { muscle: muscle.join(',') } : {}),
      ...(equipment.length ? { equipment: equipment.join(',') } : {}),
      ...(level.length ? { level: level.join(',') } : {}),
    }),
    [page, debouncedSearch, muscle, equipment, level],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/exercises', { params: query });
      setItems(data.data);
      setPagination(data.pagination);
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

  // Paging keeps the grid in view instead of leaving the user mid-list.
  useEffect(() => {
    if (page > 1) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page]);

  // Any filter change invalidates the current page number.
  const makeToggle = (setter) => (value) => {
    setPage(1);
    setter((current) =>
      current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value],
    );
  };

  const activeCount = muscle.length + equipment.length + level.length;

  const clearAll = () => {
    setMuscle([]);
    setEquipment([]);
    setLevel([]);
    setSearch('');
    setPage(1);
  };

  const filterControls = filters && (
    <div className="space-y-6">
      <FilterGroup
        label="Muscle group"
        options={filters.muscles}
        selected={muscle}
        onToggle={makeToggle(setMuscle)}
      />
      <FilterGroup
        label="Equipment"
        options={filters.equipment}
        selected={equipment}
        onToggle={makeToggle(setEquipment)}
      />
      <FilterGroup
        label="Level"
        options={filters.levels}
        selected={level}
        onToggle={makeToggle(setLevel)}
      />
      {activeCount > 0 && (
        <Button variant="ghost" size="sm" onClick={clearAll} className="w-full">
          Clear {activeCount} filter{activeCount > 1 ? 's' : ''}
        </Button>
      )}
    </div>
  );

  return (
    <div className="shell space-y-8 py-8 sm:py-12">
      <PageHeader
        eyebrow="Verified library"
        title="Exercise library"
        description="Every exercise your generated plans can draw from — filtered by the muscles you're training and the equipment you can reach."
      />

      {/* Search + mobile filter trigger */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-fog-dim"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
            placeholder="Search exercises…"
            aria-label="Search exercises"
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

        <Button
          variant="outline"
          onClick={() => setPanelOpen((open) => !open)}
          className="lg:hidden"
          aria-expanded={panelOpen}
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
          Filters
          {activeCount > 0 && (
            <span className="ml-0.5 grid size-5 place-items-center rounded-full bg-volt text-[0.625rem] font-bold text-ink">
              {activeCount}
            </span>
          )}
        </Button>
      </div>

      <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
        {/* Filters: inline panel on mobile, sticky sidebar on desktop */}
        <aside
          className={cx(
            'panel p-5 lg:sticky lg:top-20 lg:block lg:h-fit',
            panelOpen ? 'block' : 'hidden',
          )}
        >
          {filters ? filterControls : <Spinner label="Loading filters" />}
        </aside>

        <div className="min-w-0">
          {pagination && !loading && (
            <p className="mb-4 text-sm text-fog-dim">
              {pagination.total.toLocaleString()} exercise
              {pagination.total === 1 ? '' : 's'}
              {activeCount || debouncedSearch ? ' matching your filters' : ''}
            </p>
          )}

          {loading ? (
            <Spinner label="Loading exercises" />
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={Dumbbell}
              title="No matches"
              description="Nothing in the library matches this combination. Try removing a filter or searching for a different movement."
              action={
                <Button variant="outline" size="sm" onClick={clearAll}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <>
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((exercise) => (
                  <ExerciseCard key={exercise.slug} exercise={exercise} />
                ))}
              </ul>

              {pagination.totalPages > 1 && (
                <nav
                  className="mt-8 flex items-center justify-between gap-4 border-t border-line pt-6"
                  aria-label="Pagination"
                >
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((current) => current - 1)}
                  >
                    <ChevronLeft size={15} aria-hidden="true" />
                    Previous
                  </Button>
                  <span className="text-sm text-fog-dim tabular-nums">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!pagination.hasMore}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Next
                    <ChevronRight size={15} aria-hidden="true" />
                  </Button>
                </nav>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
