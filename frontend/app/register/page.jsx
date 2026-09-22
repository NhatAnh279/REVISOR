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

function validate({ email, password, confirmPassword }) {
  const errors = {};

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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
    const errors = validate({ email, password, confirmPassword });
    setFieldErrors(errors);
    setFormError("");
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
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
