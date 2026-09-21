import Link from "next/link";

export function SiteHeader({ tagline, right }) {
  return (
    <header className="w-full border-b-2 border-border bg-background">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/">
          <span className="text-2xl font-extrabold tracking-wide text-primary">
            REVISOR
          </span>
        </Link>
        {tagline && (
          <p className="hidden text-sm font-medium text-muted-foreground sm:block">
            {tagline}
          </p>
        )}
        {right}
      </div>
    </header>
  );
}
