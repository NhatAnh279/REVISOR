"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, History, Home, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

const NAV_LINKS = [
  { href: "/", label: "New Quiz", icon: Home },
  { href: "/subjects", label: "My Subjects", icon: BookOpen },
  { href: "/history", label: "History", icon: History },
];

function UserMenu() {
  const router = useRouter();
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (user === undefined) return null;

  if (!user) {
    return (
      <Button size="sm" onClick={() => router.push("/login")}>
        Login
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-sm font-medium text-muted-foreground sm:block">
        {user.email}
      </span>
      <Button size="sm" variant="outline" onClick={handleLogout}>
        Logout
      </Button>
    </div>
  );
}

export function SiteHeader({ right }) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);

  // Close the mobile nav on navigation. Setting state during render (guarded
  // by the prevPathname comparison) instead of in an effect, per React's
  // "adjusting state when a prop changes" pattern.
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setMobileNavOpen(false);
  }

  return (
    <header className="relative w-full border-b-2 border-border bg-background">
      <div className="flex w-full items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-3 md:gap-6">
          <Link href="/">
            <span className="text-2xl font-extrabold tracking-wide text-primary">
              REVISOR
            </span>
          </Link>

          <button
            type="button"
            aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen((prev) => !prev)}
            className="flex size-9 items-center justify-center rounded-[10px] text-foreground hover:bg-accent/50 md:hidden"
          >
            {mobileNavOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => {
              const isActive =
                href === "/" ? pathname === "/" : pathname.startsWith(href);
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
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {right}
          <UserMenu />
        </div>
      </div>

      {mobileNavOpen && (
        <nav className="absolute inset-x-0 top-full z-20 flex flex-col gap-1 border-b-2 border-border bg-background p-2 shadow-md md:hidden">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => {
            const isActive =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-sm font-semibold transition-colors ${
                  isActive
                    ? "bg-accent text-primary"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                }`}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
