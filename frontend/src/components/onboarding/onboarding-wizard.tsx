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
  enter: (dir: number) => ({ x: dir > 0 ? 50 : -50, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -50 : 50, opacity: 0 }),
};

const cardVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1 },
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

  const noMotion = shouldReduceMotion ?? false;

  return (
    <motion.div
      variants={cardVariants}
      initial={noMotion ? "visible" : "hidden"}
      animate="visible"
      transition={
        noMotion
          ? { duration: 0 }
          : { type: "spring", stiffness: 380, damping: 30 }
      }
      className="max-w-md w-full"
    >
      <Card>
        <CardHeader>
          <ProgressHeader
            currentStep={currentStep}
            stepLabels={STEP_LABELS}
            reduceMotion={noMotion}
          />
        </CardHeader>
        <CardContent>
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
              {currentStep === 0 && <StepProfileForm onNext={goNext} />}
              {currentStep === 1 && (
                <StepPreferencesPlaceholder onNext={goNext} onBack={goBack} />
              )}
              {currentStep === 2 && <StepCompletePlaceholder onBack={goBack} />}
            </motion.div>
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  );
}
