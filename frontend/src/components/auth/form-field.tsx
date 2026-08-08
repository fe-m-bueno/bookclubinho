import { Label } from "@/components/ui/label";

interface FormFieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}

export function FormField({ label, htmlFor, error, children }: FormFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {/* `type-meta` traz a cor apagada do papel, e o `text-destructive` a
          substitui: o erro é a única linha do formulário que precisa de cor
          própria. */}
      {error && <p className="type-meta text-destructive">{error}</p>}
    </div>
  );
}
