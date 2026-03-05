"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { ProgressHeader } from "./progress-header";
import { StepProfileForm } from "./step-profile-form";
import { StepPreferencesPlaceholder } from "./step-preferences-placeholder";
import { StepCompletePlaceholder } from "./step-complete-placeholder";

const STEP_LABELS = ["Perfil", "Preferências", "Pronto"];

const stepVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 80 : -80, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -80 : 80, opacity: 0 }),
};

export function OnboardingWizard() {
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const shouldReduceMotion = useReducedMotion();

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

  const transitionDuration = shouldReduceMotion ? 0 : 0.25;

  return (
    <Card className="max-w-md w-full">
      <CardHeader>
        <ProgressHeader
          currentStep={currentStep}
          stepLabels={STEP_LABELS}
        />
      </CardHeader>
      <CardContent>
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentStep}
            custom={direction}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: transitionDuration, ease: "easeInOut" }}
          >
            {currentStep === 0 && <StepProfileForm onNext={goNext} />}
            {currentStep === 1 && (
              <StepPreferencesPlaceholder onNext={goNext} onBack={goBack} />
            )}
            {currentStep === 2 && <StepCompletePlaceholder onBack={goBack} />}
          </motion.div>
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
