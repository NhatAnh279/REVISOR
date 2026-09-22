import { createBrowserClient } from "@supabase/ssr";

// createBrowserClient (not the plain @supabase/supabase-js client) stores the
// session in cookies instead of localStorage, so middleware.js can read it
// server-side to protect routes.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
