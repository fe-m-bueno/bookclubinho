"use client";

import { StepTextarea } from "./step-textarea";

interface StepFunnyOnelinerProps {
  value: string;
  onChange: (value: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepFunnyOneliner(props: StepFunnyOnelinerProps) {
  return (
    <StepTextarea
      title="One-liner"
      subtitle="Se esse livro fosse um tweet..."
      id="funny-oneliner"
      placeholder="Se esse livro fosse um tweet..."
      maxChars={280}
      rows={3}
      {...props}
    />
  );
}
