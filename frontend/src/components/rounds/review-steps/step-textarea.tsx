"use client";

import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface StepTextareaProps {
  title: string;
  subtitle: string;
  id: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onNext: () => void;
  onBack: () => void;
  minChars?: number;
  maxChars: number;
  rows?: number;
  required?: boolean;
}

export function StepTextarea({
  title,
  subtitle,
  id,
  placeholder,
  value,
  onChange,
  onNext,
  onBack,
  minChars = 0,
  maxChars,
  rows = 4,
  required = false,
}: StepTextareaProps) {
  const charCount = value.length;
  const isValid = !required || charCount >= minChars;

  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="space-y-1 text-center">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor={id} className="sr-only">
          {title}
        </Label>
        <Textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, maxChars))}
          placeholder={placeholder}
          rows={rows}
          className="resize-none"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span className={charCount < minChars && minChars > 0 ? "text-destructive" : ""}>
            {charCount < minChars && minChars > 0
              ? `Mínimo ${minChars - charCount} caracteres`
              : ""}
          </span>
          <span>{charCount}/{maxChars}</span>
        </div>
      </div>

      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={onBack}
          className="flex-1 min-h-[44px]"
        >
          Voltar
        </Button>
        <Button
          onClick={onNext}
          disabled={!isValid}
          className="flex-1 min-h-[44px]"
        >
          {!required && !value ? "Pular" : "Continuar"}
        </Button>
      </div>
    </div>
  );
}
