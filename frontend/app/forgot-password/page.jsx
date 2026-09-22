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
import { isValidEmail, mapAuthError } from "@/lib/auth-validation";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  function handleEmailChange(e) {
    setEmail(e.target.value);
    setFieldError("");
    setFormError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim()) {
      setFieldError("This field is required");
      return;
    }
    if (!isValidEmail(email)) {
      setFieldError("Please enter a valid email");
      return;
    }
    setFieldError("");
    setFormError("");

    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo:
        typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined,
    });
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
                  <MailCheck className="size-6" />
                </span>
                <p className="text-sm font-semibold text-foreground">
                  Check your email for reset link
                </p>
                <p className="max-w-xs text-xs text-muted-foreground">
                  If an account exists for {email}, we sent a link to reset the password.
                </p>
                <Link href="/login" className="text-sm font-semibold text-primary hover:underline">
                  Back to login
                </Link>
              </CardContent>
            ) : (
              <>
                <CardHeader>
                  <CardTitle className="text-lg">Reset your password</CardTitle>
                  <CardDescription>
                    Enter your email and we&apos;ll send you a reset link.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="space-y-4" onSubmit={handleSubmit} noValidate>
                    <FormField
                      id="email"
                      label="Email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      error={fieldError}
                      onChange={handleEmailChange}
                    />

                    {formError && <p className="text-sm text-destructive">{formError}</p>}

                    <Button className="w-full" size="lg" type="submit" disabled={loading}>
                      {loading ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="size-4 animate-spin" />
                          Sending...
                        </span>
                      ) : (
                        "Send reset link"
                      )}
                    </Button>

                    <p className="text-center text-sm text-muted-foreground">
                      Remembered your password?{" "}
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
