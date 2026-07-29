import { Link, NavLink, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const isHome = pathname === "/";

  return (
    <div className={isHome ? "flex h-screen flex-col overflow-hidden" : "min-h-screen"}>
      <header className="shrink-0 border-b border-ink-900/10 bg-sand-50/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link to="/" className="group">
            <div className="font-display text-xl font-semibold tracking-tight text-ink-950">
              EvidenceFlow
            </div>
            <div className="text-xs text-ink-700/70 group-hover:text-moss-600">
              Audit-ready ESG ingestion
            </div>
          </Link>
          <nav className="flex items-center gap-1 text-sm font-medium">
            <NavLink
              to="/imports/new"
              className={({ isActive }) =>
                `rounded-md px-3 py-2 ${isActive ? "bg-ink-900 text-sand-50" : "text-ink-800 hover:bg-ink-900/5"}`
              }
            >
              New import
            </NavLink>
            <NavLink
              to="/imports"
              className={({ isActive }) =>
                `rounded-md px-3 py-2 ${isActive ? "bg-ink-900 text-sand-50" : "text-ink-800 hover:bg-ink-900/5"}`
              }
            >
              History
            </NavLink>
          </nav>
        </div>
      </header>
      <main
        className={
          isHome
            ? "mx-auto flex w-full max-w-6xl flex-1 flex-col overflow-hidden px-4 py-4 sm:px-6"
            : "mx-auto max-w-6xl px-4 py-8 sm:px-6"
        }
      >
        {children}
      </main>
    </div>
  );
}
