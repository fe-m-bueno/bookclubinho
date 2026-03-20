"use client";

import { StepTextarea } from "./step-textarea";

interface StepExtraThoughtsProps {
  value: string;
  onChange: (value: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepExtraThoughts(props: StepExtraThoughtsProps) {
  return (
    <StepTextarea
      title="Algo a mais?"
      subtitle="Qualquer coisa que quiser dizer"
      id="extra-thoughts"
      placeholder="Qualquer coisa que quiser dizer"
      maxChars={5000}
      rows={4}
      {...props}
    />
  );
}
