"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, Home } from "lucide-react";

const NAV_LINKS = [
  { href: "/", label: "New Quiz", icon: Home },
  { href: "/history", label: "History", icon: History },
];

export function SiteHeader({ tagline, right }) {
  const pathname = usePathname();

  return (
    <header className="w-full border-b-2 border-border bg-background">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-6">
          <Link href="/">
            <span className="text-2xl font-extrabold tracking-wide text-primary">
              REVISOR
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-sm font-semibold transition-colors ${
                    isActive
                      ? "bg-accent text-primary"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  }`}
                >
                  <Icon className="size-4" />
                  <span className="hidden sm:inline">{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
        {tagline && (
          <p className="hidden text-sm font-medium text-muted-foreground md:block">
            {tagline}
          </p>
        )}
        {right}
      </div>
    </header>
  );
}
