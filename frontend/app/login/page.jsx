"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { FormField } from "@/components/form-field";
import { SiteHeader } from "@/components/site-header";
import { supabase } from "@/lib/supabase";
import { mapAuthError } from "@/lib/auth-validation";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (searchParams.get("reason") === "session_expired") {
      toast.error("Session expired, please login to continue");
    }
  }, [searchParams]);

  function clearFieldError(field) {
    setFormError("");
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: "" } : prev));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errors = {};
    if (!email.trim()) errors.email = "This field is required";
    if (!password) errors.password = "This field is required";
    setFieldErrors(errors);
    setFormError("");
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      setFormError(mapAuthError(error.message));
      return;
    }

    const redirectedFrom = searchParams.get("redirectedFrom");
    // Only follow same-origin relative paths — never an absolute/external URL.
    const isSafeRedirect = redirectedFrom?.startsWith("/") && !redirectedFrom.startsWith("//");
    router.push(isSafeRedirect ? redirectedFrom : "/");
  }

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader tagline="AI-powered study assistant" />

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm animate-fade-in space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Log in</CardTitle>
              <CardDescription>Welcome back to REVISOR.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleSubmit} noValidate>
                <FormField
                  id="email"
                  label="Email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  error={fieldErrors.email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearFieldError("email");
                  }}
                />
                <FormField
                  id="password"
                  label="Password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  error={fieldErrors.password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearFieldError("password");
                  }}
                />

                {formError && <p className="text-sm text-destructive">{formError}</p>}

                <Button className="w-full" size="lg" type="submit" disabled={loading}>
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin" />
                      Logging in...
                    </span>
                  ) : (
                    "Login"
                  )}
                </Button>

                <div className="space-y-1.5 text-center text-sm">
                  <p className="text-muted-foreground">
                    Don&apos;t have an account?{" "}
                    <Link href="/register" className="font-semibold text-primary hover:underline">
                      Register
                    </Link>
                  </p>
                  <p>
                    <Link
                      href="/forgot-password"
                      className="font-semibold text-primary hover:underline"
                    >
                      Forgot password?
                    </Link>
                  </p>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
