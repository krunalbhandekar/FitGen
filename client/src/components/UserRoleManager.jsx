import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Info,
  Search,
  Shield,
  ShieldCheck,
  User as UserIcon,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import { Badge, Button, cx, Spinner } from "./ui";
import { useDebounce } from "../hooks/useDebounce";

/**
 * Admin-managed roles.
 *
 * Granting admin is privilege escalation, so the UI is deliberately explicit:
 * every change asks for confirmation naming the person and the consequence, and
 * the caller's own row cannot be edited.
 *
 * This page is the only way a role changes — sign-in never touches roles, so
 * nothing silently reverts what an administrator sets here.
 */

const fmtDate = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

/* ------------------------------------------------------------ confirmation */

const ConfirmDialog = ({ target, onCancel, onConfirm, busy }) => {
  const promoting = target.nextRole === "admin";

  return (
    <div className="fixed inset-0 z-70 grid place-items-center p-4">
      <button
        type="button"
        aria-label="Cancel"
        onClick={onCancel}
        className="absolute inset-0 h-full w-full bg-ink/80 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="role-confirm-title"
        className="panel relative w-full max-w-md p-6"
      >
        <div className="flex items-start gap-3">
          <span
            className={cx(
              "grid size-10 shrink-0 place-items-center rounded-xl",
              promoting ? "bg-volt/12 text-volt" : "bg-ember/12 text-ember",
            )}
            aria-hidden="true"
          >
            {promoting ? <ShieldCheck size={19} /> : <UserIcon size={19} />}
          </span>
          <div className="min-w-0">
            <h2 id="role-confirm-title" className="font-bold">
              {promoting
                ? "Grant administrator access?"
                : "Revoke administrator access?"}
            </h2>
            <p className="mt-1 truncate text-sm text-fog">{target.email}</p>
          </div>
        </div>

        <p className="mt-5 text-sm leading-relaxed text-fog">
          {promoting
            ? "They will be able to view the user roster, grant and revoke administrator access, and see aggregate analytics. They will not be able to see any individual user’s profile, plans or logs."
            : "They will lose access to the admin area immediately, on their next request."}
        </p>

        <div className="mt-6 flex gap-3 border-t border-line pt-5">
          <Button
            variant={promoting ? "primary" : "danger"}
            onClick={onConfirm}
            loading={busy}
          >
            {promoting ? "Grant access" : "Revoke access"}
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------- table */

export const UserRoleManager = () => {
  const [users, setUsers] = useState(null);
  const [meta, setMeta] = useState(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState(null);
  const [flash, setFlash] = useState(null);
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);

  const debouncedSearch = useDebounce(search);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await api.get("/admin/users", {
        params: {
          page,
          limit: 25,
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
          ...(roleFilter ? { role: roleFilter } : {}),
        },
      });
      setUsers(data.data);
      setMeta(data.meta);
    } catch (err) {
      setError(err.message);
      setUsers([]);
    }
  }, [page, debouncedSearch, roleFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const applyRole = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.patch(`/admin/users/${pending.id}/role`, {
        role: pending.nextRole,
      });
      setFlash(data.message);
      setPending(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel p-5 sm:p-6" aria-labelledby="roles-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="roles-heading" className="flex items-center gap-2 font-bold">
            <Shield size={16} className="text-volt" aria-hidden="true" />
            User roles
          </h2>
          <p className="mt-0.5 text-xs text-fog-dim">
            Grant or revoke administrator access.
            {meta
              ? ` ${meta.adminCount} admin${meta.adminCount === 1 ? "" : "s"} of ${meta.total} users.`
              : ""}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fog-dim"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder="Search by name or email…"
            aria-label="Search users"
            className="h-10 w-full rounded-xl border border-line bg-panel pr-3 pl-9 text-sm placeholder:text-fog-dim focus:border-volt focus:outline-none"
          />
        </div>

        <div className="flex gap-1.5" role="group" aria-label="Filter by role">
          {[
            { value: "", label: "All" },
            { value: "admin", label: "Admins" },
            { value: "user", label: "Members" },
          ].map((option) => (
            <button
              key={option.value || "all"}
              type="button"
              aria-pressed={roleFilter === option.value}
              onClick={() => {
                setPage(1);
                setRoleFilter(option.value);
              }}
              className={cx(
                "rounded-xl border px-3 py-2 text-xs font-semibold transition-colors",
                roleFilter === option.value
                  ? "border-volt bg-volt text-ink"
                  : "border-line text-fog hover:border-line-bright hover:text-chalk",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {flash && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-volt/30 bg-volt/8 p-3 text-sm text-volt">
          <ShieldCheck
            size={15}
            className="mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <span className="flex-1">{flash}</span>
          <button
            type="button"
            onClick={() => setFlash(null)}
            aria-label="Dismiss"
            className="text-volt/70 hover:text-volt"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2.5 rounded-xl border border-ember/30 bg-ember/8 p-3 text-sm text-ember"
        >
          <AlertTriangle
            size={15}
            className="mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <span>{error}</span>
        </div>
      )}

      {/* Roster */}
      {users === null ? (
        <Spinner label="Loading users" />
      ) : users.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-fog-dim">
          No users match that search.
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-line">
          {users.map((user) => (
            <li
              key={user.id}
              className="flex flex-wrap items-center gap-3 py-3"
            >
              <span
                className="grid size-9 shrink-0 place-items-center rounded-full bg-panel-2 font-bold text-fog"
                aria-hidden="true"
              >
                {user.name?.charAt(0).toUpperCase() ?? "?"}
              </span>

              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-semibold">{user.name}</span>
                  {user.role === "admin" && (
                    <Badge tone="volt">
                      <Shield size={10} aria-hidden="true" />
                      Admin
                    </Badge>
                  )}
                  {user.isSelf && <Badge tone="neutral">You</Badge>}
                </p>
                <p className="truncate text-xs text-fog-dim">{user.email}</p>
                <p className="mt-0.5 text-[0.625rem] text-fog-dim">
                  Joined {fmtDate(user.createdAt)}
                  {user.lastLoginAt
                    ? ` · last seen ${fmtDate(user.lastLoginAt)}`
                    : ""}
                  {user.roleManagedAt ? " · role set manually" : ""}
                </p>
              </div>

              {user.isSelf ? (
                <span className="shrink-0 text-xs text-fog-dim">
                  Your own role can&apos;t be changed here
                </span>
              ) : (
                <Button
                  variant={user.role === "admin" ? "outline" : "primary"}
                  size="sm"
                  className="shrink-0"
                  onClick={() =>
                    setPending({
                      id: user.id,
                      email: user.email,
                      nextRole: user.role === "admin" ? "user" : "admin",
                    })
                  }
                >
                  {user.role === "admin" ? "Revoke admin" : "Make admin"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <nav
          className="mt-5 flex items-center justify-between gap-4 border-t border-line pt-4"
          aria-label="Pagination"
        >
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft size={14} aria-hidden="true" />
            Previous
          </Button>
          <span className="text-xs text-fog-dim tabular-nums">
            Page {meta.page} of {meta.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
            <ChevronRight size={14} aria-hidden="true" />
          </Button>
        </nav>
      )}

      {/* How roles are granted */}
      <div className="mt-5 flex gap-2.5 border-t border-line pt-4">
        <Info
          size={14}
          className="mt-0.5 shrink-0 text-fog-dim"
          aria-hidden="true"
        />
        <p className="text-xs leading-relaxed text-fog-dim">
          <span className="font-semibold text-fog">
            This page is the only way in.
          </span>{" "}
          New accounts are always members, and signing in never changes a role —
          so whatever is set here is what holds. You cannot change your own
          role, and the last remaining administrator cannot be removed, which
          keeps this page from locking itself out.
        </p>
      </div>

      {pending && (
        <ConfirmDialog
          target={pending}
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={applyRole}
        />
      )}
    </section>
  );
};
