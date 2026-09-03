import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Apple,
  Bot,
  ChevronDown,
  ClipboardList,
  Dumbbell,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  Salad,
  Settings,
  Shield,
  TrendingUp,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Button, cx, Logo } from "./ui";

/**
 * Primary navigation.
 *
 * A `group` marks a link as belonging to a desktop dropdown rather than sitting
 * directly in the bar. Eight top-level links do not fit legibly, and grouping
 * the two reference libraries keeps them reachable — an earlier version simply
 * hid them on desktop, which made two features look missing.
 *
 * `userMenu` moves a link into the avatar dropdown instead, alongside sign-out.
 *
 * The mobile drawer has room, so it renders every link flat.
 */
const NAV_LINKS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/plan/workout", label: "Workout", icon: Dumbbell },
  { to: "/plan/diet", label: "Diet", icon: Salad },
  { to: "/log", label: "Log", icon: ClipboardList },
  { to: "/progress", label: "Progress", icon: TrendingUp },
  { to: "/coach", label: "Coach", icon: Bot },
  { to: "/exercises", label: "Exercises", icon: Library, group: "Library" },
  { to: "/foods", label: "Foods", icon: Apple, group: "Library" },
  { to: "/profile", label: "Profile", icon: Settings, userMenu: true },
];

/**
 * Desktop dropdown for a group of nav links. Closes on outside click, on
 * Escape, and on navigation; the trigger reflects whether a child route is
 * active so the bar still shows where you are.
 */
const NavGroup = ({ label, links }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const location = useLocation();

  const childActive = links.some((l) => location.pathname.startsWith(l.to));

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className={cx(
          "flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm font-semibold whitespace-nowrap transition-colors",
          childActive || open
            ? "bg-panel-2 text-volt"
            : "text-fog hover:text-chalk",
        )}
      >
        {label}
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={cx("transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-xl border border-line bg-panel shadow-2xl"
          role="menu"
        >
          {links.map(({ to, label: itemLabel, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cx(
                  "flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-semibold transition-colors",
                  isActive
                    ? "bg-volt/10 text-volt"
                    : "text-fog hover:bg-panel-2 hover:text-chalk",
                )
              }
            >
              <Icon size={15} aria-hidden="true" />
              {itemLabel}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
};

const Avatar = ({ user, name, size = 32 }) => {
  const [failed, setFailed] = useState(false);

  if (user.avatarUrl && !failed) {
    return (
      <img
        src={user.avatarUrl}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="rounded-full border border-line object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  // Google avatar URLs expire; initials keep the layout stable.
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-full bg-volt/15 font-bold text-volt"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {name?.charAt(0).toUpperCase() ?? "?"}
    </span>
  );
};

/**
 * Account menu, triggered by the avatar.
 *
 * Replaces what used to be two separate controls in the bar (a name block and a
 * sign-out button) with one circular target, which is the conventional place
 * users look for account actions and frees horizontal room for real navigation.
 */
const UserMenu = ({ user, displayName, links, onSignOut }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const location = useLocation();

  // Close on navigation, so following a link doesn't leave the menu hanging.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        // Return focus to the trigger rather than dropping it to the document.
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Account menu for ${displayName}`}
        className={cx(
          "grid size-9 place-items-center rounded-full transition-all",
          "ring-2 ring-offset-2 ring-offset-ink",
          open ? "ring-volt" : "ring-transparent hover:ring-line-bright",
        )}
      >
        <Avatar user={user} name={displayName} size={36} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-panel shadow-2xl"
        >
          {/* Identity header — the name and email the bar no longer shows */}
          <div className="flex items-center gap-3 border-b border-line p-3.5">
            <Avatar user={user} name={displayName} size={38} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{displayName}</p>
              <p className="truncate text-xs text-fog-dim">{user.email}</p>
            </div>
          </div>

          {user.role === "admin" && (
            <p className="border-b border-line px-3.5 py-2">
              <span className="text-[0.625rem] font-bold tracking-wider text-volt uppercase">
                Admin account
              </span>
            </p>
          )}

          <div className="p-1.5">
            {links.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cx(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
                    isActive
                      ? "bg-volt/10 text-volt"
                      : "text-fog hover:bg-panel-2 hover:text-chalk",
                  )
                }
              >
                <Icon size={15} aria-hidden="true" />
                {label}
              </NavLink>
            ))}

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-fog transition-colors hover:bg-ember/10 hover:text-ember"
            >
              <LogOut size={15} aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const Navbar = () => {
  const { isAuthenticated, isAdmin, user, displayName, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const closeButtonRef = useRef(null);

  // `userMenu` keeps Admin out of the main bar and in the avatar dropdown,
  // alongside Profile and Sign out — it is an account-level destination, not a
  // day-to-day one, and the bar is already at its legible limit.
  const links = isAdmin
    ? [
        ...NAV_LINKS,
        { to: "/admin", label: "Admin", icon: Shield, userMenu: true },
      ]
    : NAV_LINKS;

  // Grouped links render in the desktop dropdown; the drawer shows all of them.
  const groupedLinks = links.filter((link) => link.group === "Library");
  const accountLinks = links.filter((link) => link.userMenu);

  // Close the drawer on navigation.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Lock scroll and trap Escape while the drawer is open.
  useEffect(() => {
    if (!menuOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const linkClass = ({ isActive }) =>
    cx(
      "rounded-lg px-2.5 py-2 text-sm font-semibold whitespace-nowrap transition-colors",
      isActive ? "bg-panel-2 text-volt" : "text-fog hover:text-chalk",
    );

  return (
    <>
      <a
        href="#main"
        className="sr-only-focusable fixed top-3 left-3 z-100 rounded-lg bg-volt px-4 py-2 text-sm font-bold text-ink"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-50 border-b border-line bg-ink/85 backdrop-blur-md">
        <div className="shell flex h-16 items-center justify-between gap-4">
          <Logo />

          {/* Desktop navigation */}
          {isAuthenticated && (
            <nav
              className="hidden items-center gap-0.5 lg:flex"
              aria-label="Main"
            >
              {links
                .filter((link) => !link.group && !link.userMenu)
                .map(({ to, label }) => (
                  <NavLink key={to} to={to} className={linkClass}>
                    {label}
                  </NavLink>
                ))}
              {groupedLinks.length > 0 && (
                <NavGroup label="Library" links={groupedLinks} />
              )}
            </nav>
          )}

          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <div className="hidden lg:block">
                <UserMenu
                  user={user}
                  displayName={displayName}
                  links={accountLinks}
                  onSignOut={handleSignOut}
                />
              </div>
            ) : (
              <Button
                as={Link}
                to="/login"
                size="sm"
                className="hidden sm:inline-flex"
              >
                Get started
              </Button>
            )}

            {/* Mobile trigger */}
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="grid size-10 place-items-center rounded-lg border border-line text-chalk lg:hidden"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              aria-controls="mobile-drawer"
            >
              <Menu size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-60 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 h-full w-full bg-ink/80 backdrop-blur-sm"
          />
          <div
            id="mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="absolute inset-y-0 right-0 flex w-[min(20rem,85vw)] flex-col border-l border-line bg-panel"
          >
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-4">
              <Logo />
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setMenuOpen(false)}
                className="grid size-10 place-items-center rounded-lg border border-line"
                aria-label="Close menu"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {/*
              Sign out is pinned in its own non-scrolling footer rather than
              placed after the nav with `mt-auto`. With ten destinations the
              drawer content exceeds a small phone's viewport, and `mt-auto`
              collapses to zero once there is no free space — which put the
              button below the fold on an iPhone SE or 8, with a full-height
              nav list giving no hint that anything followed it.
            */}
            {isAuthenticated ? (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  <div className="mb-5 flex items-center gap-3 rounded-xl border border-line bg-panel-2 p-3">
                    <Avatar user={user} name={displayName} size={40} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{displayName}</p>
                      <p className="truncate text-xs text-fog-dim">
                        {user.email}
                      </p>
                      <p className="text-[0.625rem] tracking-wide text-fog-dim uppercase">
                        {user.role}
                      </p>
                    </div>
                  </div>

                  <nav className="flex flex-col gap-1" aria-label="Main">
                    {links.map(({ to, label, icon: Icon }) => (
                      <NavLink
                        key={to}
                        to={to}
                        className={({ isActive }) =>
                          cx(
                            "flex items-center gap-3 rounded-xl px-3 py-3 font-semibold transition-colors",
                            isActive
                              ? "bg-volt/10 text-volt"
                              : "text-fog hover:bg-panel-2 hover:text-chalk",
                          )
                        }
                      >
                        <Icon size={18} aria-hidden="true" />
                        {label}
                      </NavLink>
                    ))}
                  </nav>
                </div>

                <div className="shrink-0 border-t border-line p-4">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleSignOut}
                  >
                    <LogOut size={16} aria-hidden="true" />
                    Sign out
                  </Button>
                </div>
              </>
            ) : (
              <div className="p-4">
                <Button as={Link} to="/login" size="lg" className="w-full">
                  Get started
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
