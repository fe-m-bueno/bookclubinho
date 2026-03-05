"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ProgressHeader } from "./progress-header";
import { StepProfileForm } from "./step-profile-form";
import { StepGenresForm } from "./step-genres-form";
import { StepClubForm } from "./step-club-form";

const STEP_LABELS = ["Perfil", "Preferências", "Clube"];

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
    <Card className={cn("w-full transition-all duration-300", currentStep === 2 ? "max-w-2xl" : "max-w-lg")}>
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
              <StepGenresForm onNext={goNext} onBack={goBack} />
            )}
            {currentStep === 2 && <StepClubForm onBack={goBack} />}
          </motion.div>
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
