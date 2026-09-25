"use client";

import { useState } from "react";
import Link from "next/link";
import { MailCheck, Loader2 } from "lucide-react";
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
import { getPasswordError, isValidEmail, mapAuthError } from "@/lib/auth-validation";

function validate({ fullName, email, password, confirmPassword }) {
  const errors = {};

  if (!fullName.trim()) errors.fullName = "This field is required";

  if (!email.trim()) errors.email = "This field is required";
  else if (!isValidEmail(email)) errors.email = "Please enter a valid email";

  if (!password) errors.password = "This field is required";
  else {
    const passwordError = getPasswordError(password);
    if (passwordError) errors.password = passwordError;
  }

  if (!confirmPassword) errors.confirmPassword = "This field is required";
  else if (password !== confirmPassword) errors.confirmPassword = "Passwords do not match";

  return errors;
}

export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState("student");
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  function clearFieldError(field) {
    setFormError("");
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: "" } : prev));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errors = validate({ fullName, email, password, confirmPassword });
    setFieldErrors(errors);
    setFormError("");
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName.trim(), role } },
    });
    setLoading(false);

    if (error) {
      setFormError(mapAuthError(error.message));
      return;
    }
    // When email confirmation is required, Supabase returns a user with no
    // identities instead of an error when the email is already registered.
    if (data?.user?.identities?.length === 0) {
      setFormError("An account with this email already exists");
      return;
    }

    // With email confirmation on there is no session yet, so RLS would reject
    // this write; the handle_new_user trigger (migration 0005) creates the
    // profile from the signup metadata in that case.
    if (data?.session && data.user) {
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert({ id: data.user.id, full_name: fullName.trim(), role });
      if (profileError) {
        setFormError("Account created, but we could not save your profile. Please contact support.");
        return;
      }
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
                  <MailCheck className="size-6" />
                </span>
                <p className="text-sm font-semibold text-foreground">
                  Check your email to confirm account
                </p>
                <p className="max-w-xs text-xs text-muted-foreground">
                  We sent a confirmation link to {email}.
                </p>
                <Link href="/login" className="text-sm font-semibold text-primary hover:underline">
                  Back to login
                </Link>
              </CardContent>
            ) : (
              <>
                <CardHeader>
                  <CardTitle className="text-lg">Create an account</CardTitle>
                  <CardDescription>Start reviewing your lectures with REVISOR.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="space-y-4" onSubmit={handleSubmit} noValidate>
                    <FormField
                      id="full-name"
                      label="Full name"
                      autoComplete="name"
                      value={fullName}
                      error={fieldErrors.fullName}
                      onChange={(e) => {
                        setFullName(e.target.value);
                        clearFieldError("fullName");
                      }}
                    />
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
                      label="Confirm password"
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      error={fieldErrors.confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        clearFieldError("confirmPassword");
                      }}
                    />

                    <div className="space-y-1.5">
                      <p className="text-sm font-medium text-foreground">I am a...</p>
                      <div className="grid grid-cols-2 gap-2">
                        {["student", "teacher"].map((r) => (
                          <Button
                            key={r}
                            type="button"
                            variant={role === r ? "default" : "outline"}
                            aria-pressed={role === r}
                            onClick={() => setRole(r)}
                            className="capitalize"
                          >
                            {r}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {formError && <p className="text-sm text-destructive">{formError}</p>}

                    <Button className="w-full" size="lg" type="submit" disabled={loading}>
                      {loading ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="size-4 animate-spin" />
                          Creating account...
                        </span>
                      ) : (
                        "Register"
                      )}
                    </Button>

                    <p className="text-center text-sm text-muted-foreground">
                      Already have an account?{" "}
                      <Link href="/login" className="font-semibold text-primary hover:underline">
                        Login
                      </Link>
                    </p>
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
