"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

// navigator.clipboard is only available in secure contexts (HTTPS/localhost),
// so on plain HTTP fall back to a hidden textarea + execCommand.
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // fall through to the legacy path
  }
  const el = document.createElement("textarea");
  el.value = text;
  el.setAttribute("readonly", "");
  el.style.position = "fixed";
  el.style.opacity = "0";
  document.body.appendChild(el);
  try {
    el.select();
    if (!document.execCommand("copy")) throw new Error("copy command failed");
  } finally {
    document.body.removeChild(el);
  }
}

export function CopyButton({ value, label = "Copy", size = "sm", variant = "outline" }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await copyToClipboard(value);
      setCopied(true);
      toast.success("Copied!");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  return (
    <Button type="button" size={size} variant={variant} onClick={handleCopy}>
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      {label}
    </Button>
  );
}
