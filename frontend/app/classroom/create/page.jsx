"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FormField } from "@/components/form-field";
import { SiteHeader } from "@/components/site-header";
import { CopyButton } from "@/components/classroom/copy-button";
import { createClassroom } from "@/lib/api";

export default function CreateClassroomPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || !subject.trim()) {
      setError("Enter a class name and a subject.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      setCreated(await createClassroom({ name: name.trim(), subject: subject.trim() }));
    } catch (err) {
      setError(err.message || "Could not create the classroom.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="flex-1 animate-fade-in px-4 py-10">
        <div className="mx-auto w-full max-w-lg space-y-6">
          <button
            type="button"
            onClick={() => router.push("/classroom")}
            className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Classrooms
          </button>

          {created ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{created.name} is ready</CardTitle>
                <CardDescription>Share this join code with your students.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5 text-center">
                <p className="select-all rounded-[12px] border-2 border-dashed border-primary bg-accent/40 py-6 text-4xl font-extrabold tracking-[0.3em] text-primary sm:text-5xl">
                  {created.join_code}
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                  <CopyButton value={created.join_code} label="Copy code" />
                  <Button onClick={() => router.push(`/classroom/${created.id}`)}>
                    Go to classroom
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Create classroom</CardTitle>
                <CardDescription>Students join with a code you can share.</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={handleSubmit} noValidate>
                  <FormField
                    id="class-name"
                    label="Class name"
                    placeholder="e.g. Grade 10 - Section A"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <FormField
                    id="class-subject"
                    label="Subject"
                    placeholder="e.g. Biology"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button className="w-full" size="lg" type="submit" disabled={loading}>
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="size-4 animate-spin" />
                        Creating...
                      </span>
                    ) : (
                      "Create Classroom"
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
