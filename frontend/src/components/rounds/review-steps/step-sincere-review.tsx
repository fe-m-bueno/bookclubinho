"use client";

import { StepTextarea } from "./step-textarea";

interface StepSincereReviewProps {
  value: string;
  onChange: (value: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepSincereReview(props: StepSincereReviewProps) {
  return (
    <StepTextarea
      title="Review sincero"
      subtitle="O que esse livro te fez sentir?"
      id="sincere-review"
      placeholder="O que esse livro te fez sentir?"
      minChars={20}
      maxChars={5000}
      rows={6}
      required
      {...props}
    />
  );
}
