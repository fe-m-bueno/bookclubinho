"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import ReactConfetti from "react-confetti";
import { toast } from "sonner";
import { useAuthSubmit, JSON_HEADERS } from "@/hooks/use-auth-submit";
import { useWindowSize } from "@/hooks/use-window-size";
import { ProgressHeader } from "../onboarding/progress-header";
import { StepStarRating } from "./review-steps/step-star-rating";
import { StepBooleanToggles } from "./review-steps/step-boolean-toggles";
import { StepSincereReview } from "./review-steps/step-sincere-review";
import { StepFunnyOneliner } from "./review-steps/step-funny-oneliner";
import { StepExtraThoughts } from "./review-steps/step-extra-thoughts";
import { StepSummary } from "./review-steps/step-summary";

const STEP_LABELS = ["Nota", "Sentimentos", "Review", "One-liner", "Extra", "Enviar"];

const stepVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 50 : -50, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -50 : 50, opacity: 0 }),
};

interface ReviewWizardProps {
  roundId: string;
  onSubmitted: () => void;
}

export function ReviewWizard({ roundId, onSubmitted }: ReviewWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [showCelebration, setShowCelebration] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const noMotion = shouldReduceMotion ?? false;
  const { width, height } = useWindowSize();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Form state
  const [starRating, setStarRating] = useState(0);
  const [booleans, setBooleans] = useState({
    cried: false,
    loved_it: false,
    felt_aroused: false,
    found_heavy: false,
    wants_more_from_author: false,
  });
  const [sincereReview, setSincereReview] = useState("");
  const [funnyOneliner, setFunnyOneliner] = useState("");
  const [extraThoughts, setExtraThoughts] = useState("");

  const { submit, loading: submitting } = useAuthSubmit({
    url: `/api/v1/rounds/${roundId}/review`,
    headers: JSON_HEADERS,
    onSuccess: async () => {
      setShowCelebration(true);
      toast.success("Review enviada!");
      timerRef.current = setTimeout(() => onSubmitted(), 4000);
    },
    statusHandlers: [
      {
        status: 409,
        handler: async (res) => {
          const data = await res.json();
          toast.error(data.detail || "Você já enviou uma review.");
        },
      },
    ],
  });

  function goNext() {
    if (currentStep < STEP_LABELS.length - 1) {
      setDirection(1);
      setCurrentStep((s) => s + 1);
    }
  }

  function goBack() {
    if (currentStep > 0) {
      setDirection(-1);
      setCurrentStep((s) => s - 1);
    }
  }

  function handleBooleanChange(key: string, value: boolean) {
    setBooleans((prev) => ({ ...prev, [key as keyof typeof prev]: value }));
  }

  const reviewData = {
    star_rating: starRating,
    ...booleans,
    sincere_review: sincereReview,
    funny_oneliner: funnyOneliner,
    extra_thoughts: extraThoughts,
  };

  function handleSubmit() {
    submit(JSON.stringify({
      ...reviewData,
      funny_oneliner: reviewData.funny_oneliner || null,
      extra_thoughts: reviewData.extra_thoughts || null,
    }));
  }

  if (showCelebration) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        {!noMotion && (
          <ReactConfetti
            width={width}
            height={height}
            recycle={false}
            numberOfPieces={300}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              zIndex: 50,
              pointerEvents: "none",
            }}
          />
        )}
        <motion.div
          initial={noMotion ? {} : { scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={
            noMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 300, damping: 20 }
          }
          className="flex flex-col items-center gap-3"
        >
          <span className="text-5xl">
            {"\uD83C\uDF89"}
          </span>
          <h2 className="text-2xl font-bold">Review enviada!</h2>
          <p className="text-muted-foreground max-w-xs">
            Quando todos responderem, a revelação começa.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-4">
        <ProgressHeader
          currentStep={currentStep}
          stepLabels={STEP_LABELS}
          reduceMotion={noMotion}
        />
      </div>

      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={currentStep}
          custom={direction}
          variants={stepVariants}
          initial={noMotion ? "center" : "enter"}
          animate="center"
          exit={noMotion ? "center" : "exit"}
          transition={
            noMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 400, damping: 32 }
          }
        >
          {currentStep === 0 && (
            <StepStarRating
              value={starRating}
              onChange={setStarRating}
              onNext={goNext}
              noMotion={noMotion}
            />
          )}
          {currentStep === 1 && (
            <StepBooleanToggles
              values={booleans}
              onChange={handleBooleanChange}
              onNext={goNext}
              onBack={goBack}
              noMotion={noMotion}
            />
          )}
          {currentStep === 2 && (
            <StepSincereReview
              value={sincereReview}
              onChange={setSincereReview}
              onNext={goNext}
              onBack={goBack}
            />
          )}
          {currentStep === 3 && (
            <StepFunnyOneliner
              value={funnyOneliner}
              onChange={setFunnyOneliner}
              onNext={goNext}
              onBack={goBack}
            />
          )}
          {currentStep === 4 && (
            <StepExtraThoughts
              value={extraThoughts}
              onChange={setExtraThoughts}
              onNext={goNext}
              onBack={goBack}
            />
          )}
          {currentStep === 5 && (
            <StepSummary
              data={reviewData}
              onSubmit={handleSubmit}
              onBack={goBack}
              submitting={submitting}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
