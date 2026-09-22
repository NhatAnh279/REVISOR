"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
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
import { getPasswordError, mapAuthError } from "@/lib/auth-validation";

// Landing page for the link sent by resetPasswordForEmail(): exchanges the
// recovery code for a session, then lets the user set a new password.
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [readyError, setReadyError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) return;
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) setReadyError(mapAuthError(error.message));
    });
  }, [searchParams]);

  function clearFieldError(field) {
    setFormError("");
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: "" } : prev));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errors = {};
    if (!password) errors.password = "This field is required";
    else {
      const passwordError = getPasswordError(password);
      if (passwordError) errors.password = passwordError;
    }
    if (!confirmPassword) errors.confirmPassword = "This field is required";
    else if (password !== confirmPassword) errors.confirmPassword = "Passwords do not match";
    setFieldErrors(errors);
    setFormError("");
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setFormError(mapAuthError(error.message));
      return;
    }
    setSuccess(true);
  }

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader tagline="AI-powered study assistant" />

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm animate-fade-in space-y-6">
          <Card>
            {success ? (
              <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-success/10 text-success">
                  <CheckCircle2 className="size-6" />
                </span>
                <p className="text-sm font-semibold text-foreground">Password updated</p>
                <Button size="sm" onClick={() => router.push("/login")}>
                  Back to login
                </Button>
              </CardContent>
            ) : (
              <>
                <CardHeader>
                  <CardTitle className="text-lg">Set a new password</CardTitle>
                  <CardDescription>Choose a new password for your account.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="space-y-4" onSubmit={handleSubmit} noValidate>
                    <FormField
                      id="password"
                      label="New password"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      error={fieldErrors.password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        clearFieldError("password");
                      }}
                    />
                    <FormField
                      id="confirm-password"
                      label="Confirm new password"
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      error={fieldErrors.confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        clearFieldError("confirmPassword");
                      }}
                    />

                    {(formError || readyError) && (
                      <p className="text-sm text-destructive">{formError || readyError}</p>
                    )}

                    <Button className="w-full" size="lg" type="submit" disabled={loading}>
                      {loading ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="size-4 animate-spin" />
                          Updating...
                        </span>
                      ) : (
                        "Update password"
                      )}
                    </Button>
                  </form>
                </CardContent>
              </>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}
