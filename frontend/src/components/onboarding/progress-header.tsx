import { Progress } from "@/components/ui/progress";

interface ProgressHeaderProps {
  currentStep: number;
  stepLabels: string[];
}

export function ProgressHeader({ currentStep, stepLabels }: ProgressHeaderProps) {
  const progressValue = ((currentStep + 1) / stepLabels.length) * 100;

  return (
    <div className="space-y-3">
      <Progress value={progressValue} className="h-2" />
      <div className="flex justify-between">
        {stepLabels.map((label, i) => (
          <span
            key={label}
            className={`text-xs ${
              i === currentStep
                ? "font-semibold text-foreground"
                : "text-muted-foreground"
            }`}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
