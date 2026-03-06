"use client";

import { useCallback } from "react";
import Joyride, {
  type CallBackProps,
  type Step,
  type TooltipRenderProps,
  STATUS,
  ACTIONS,
} from "react-joyride";
import { useTourCompleted } from "@/hooks/use-tour-completed";
import { Button } from "@/components/ui/button";

const steps: Step[] = [
  {
    target: '[data-tour="clubs"]',
    content: "Aqui ficam seus clubes do livro. Toque em um para entrar!",
    disableBeacon: true,
  },
  {
    target: '[data-tour="current-round"]',
    content:
      "Essa é a rodada atual do clube. Você pode indicar livros, votar e acompanhar o progresso.",
  },
  {
    target: '[data-tour="group-chat"]',
    content:
      "Converse com o grupo por aqui. Compartilhe pensamentos, memes e trechos favoritos.",
  },
  {
    target: '[data-tour="reading-progress"]',
    content: "Acompanhe seu progresso de leitura e veja como o grupo está indo.",
  },
  {
    target: '[data-tour="reading-timer"]',
    content:
      "Use o timer para registrar suas sessões de leitura e manter sua streak!",
  },
  {
    target: '[data-tour="meetings"]',
    content:
      "Agende encontros do clube e confirme presença. Não perca nenhuma discussão!",
  },
];

const joyrideStyles = {
  options: {
    zIndex: 10000,
    arrowColor: "hsl(var(--card))",
  },
  overlay: {
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  spotlight: {
    borderRadius: 12,
  },
};

const floaterProps = {
  styles: {
    arrow: {
      spread: 16,
      length: 8,
    },
  },
};

function TourTooltip({
  continuous,
  index,
  step,
  size,
  backProps,
  primaryProps,
  skipProps,
  isLastStep,
}: TooltipRenderProps) {
  return (
    <div className="bg-card text-card-foreground rounded-xl shadow-lg border border-border p-5 max-w-xs">
      <p className="text-sm leading-relaxed">{step.content as string}</p>

      <div className="flex items-center justify-between mt-4 gap-2">
        <Button
          variant="ghost"
          size="xs"
          {...skipProps}
          className="text-muted-foreground hover:text-foreground"
        >
          Pular tour
        </Button>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {index + 1}/{size}
          </span>

          {index > 0 && (
            <Button variant="outline" size="sm" {...backProps}>
              Voltar
            </Button>
          )}

          <Button size="sm" {...primaryProps}>
            {isLastStep ? "Finalizar" : continuous ? "Próximo" : "Ok"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function OnboardingTourInner({ markCompleted }: { markCompleted: () => void }) {
  const handleCallback = useCallback(
    (data: CallBackProps) => {
      const { status, action } = data;

      if (
        status === STATUS.FINISHED ||
        status === STATUS.SKIPPED ||
        action === ACTIONS.CLOSE
      ) {
        markCompleted();
      }
    },
    [markCompleted]
  );

  return (
    <Joyride
      steps={steps}
      run
      continuous
      showSkipButton
      disableOverlayClose
      callback={handleCallback}
      tooltipComponent={TourTooltip}
      styles={joyrideStyles}
      floaterProps={floaterProps}
    />
  );
}

export function OnboardingTour() {
  const { completed, markCompleted } = useTourCompleted();

  if (completed) return null;

  return <OnboardingTourInner markCompleted={markCompleted} />;
}
