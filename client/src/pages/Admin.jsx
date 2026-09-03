import { useCallback, useEffect, useState } from 'react';
import { Apple, Dumbbell, ShieldCheck, UserCheck, Users } from 'lucide-react';
import { api } from '../lib/api';
import { ErrorState, PageHeader, Spinner, StatCard } from '../components/ui';
import { UserRoleManager } from '../components/UserRoleManager';
import { ContentManager } from '../components/ContentManager';

/** Simple horizontal bar list — Recharts arrives with the Phase 4 dashboard. */
const BarList = ({ title, rows }) => {
  const max = Math.max(...rows.map((row) => row.count), 1);

  return (
    <section className="panel p-5 sm:p-6">
      <h2 className="eyebrow">{title}</h2>
      <ul className="mt-4 space-y-3">
        {rows.map(({ label, count }) => (
          <li key={label}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate capitalize">{label}</span>
              <span className="shrink-0 font-semibold text-fog tabular-nums">
                {count}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-panel-2">
              <div
                className="h-full rounded-full bg-volt"
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};

export const Admin = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /*
   * `silent` refreshes the counts without collapsing the page into a spinner.
   * A content edit invalidates the totals, but flashing the whole admin screen
   * away after every save — and losing the search box the admin was working in
   * — is far more disruptive than briefly stale numbers.
   */
  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/admin/stats');
      setStats(data.data);
    } catch (err) {
      if (!silent) setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Spinner label="Loading analytics" className="min-h-[60vh]" />;

  if (error) {
    return (
      <div className="shell py-12">
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }

  return (
    <div className="shell space-y-8 py-8 sm:py-12">
      <PageHeader
        eyebrow="Admin · RBAC protected"
        title="Admin"
        description="Role management plus aggregate analytics. An administrator can see who exists in order to grant access, but never an individual user's profile, plans, logs or chat history."
      />

      <section
        aria-label="Platform totals"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <StatCard icon={Users} label="Total users" value={stats.users.total} />
        <StatCard
          icon={UserCheck}
          label="Onboarded"
          value={stats.users.onboarded}
          hint={`${stats.users.newThisWeek} joined this week`}
        />
        <StatCard icon={ShieldCheck} label="Admins" value={stats.users.admins} />
        <StatCard
          icon={Dumbbell}
          label="Exercises seeded"
          value={stats.database.exercises}
        />
      </section>

      <section aria-label="Database" className="grid gap-4 sm:grid-cols-2">
        <StatCard
          icon={Apple}
          label="Foods seeded"
          value={stats.database.foods}
          hint="Curated nutrition database"
        />
        <StatCard
          icon={Dumbbell}
          label="Equipment types"
          value={stats.exercisesByEquipment.length}
          hint="Distinct equipment in the library"
        />
      </section>

      {/* Content CRUD comes before analytics: it is the actionable half. */}
      <ContentManager onChanged={() => load({ silent: true })} />

      <UserRoleManager />

      <div className="grid gap-4 lg:grid-cols-2">
        <BarList
          title="Exercises by muscle group (top 10)"
          rows={stats.exercisesByMuscle}
        />
        <BarList
          title="Exercises by equipment (top 10)"
          rows={stats.exercisesByEquipment}
        />
      </div>

      <p className="text-xs text-fog-dim">
        Analytics are aggregate counts only — no individual user's profile, plans,
        logs or chat history is reachable from here.
      </p>
    </div>
  );
};
