import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FormField({ id, label, error, ...inputProps }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} aria-invalid={Boolean(error)} {...inputProps} />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
