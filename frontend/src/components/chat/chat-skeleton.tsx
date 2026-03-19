"use client";

import { Skeleton } from "@/components/ui/skeleton";

interface BubbleSkeletonProps {
  side: "left" | "right";
  width: string;
}

function BubbleSkeleton({ side, width }: BubbleSkeletonProps) {
  const isRight = side === "right";

  return (
    <div
      className={`flex items-end gap-2 ${isRight ? "flex-row-reverse" : "flex-row"}`}
    >
      {/* Avatar placeholder */}
      {!isRight && <Skeleton className="size-7 shrink-0 rounded-full" />}
      {isRight && <div className="w-7 shrink-0" />}

      <div className={`flex flex-col gap-1 ${isRight ? "items-end" : "items-start"}`}>
        {/* Name placeholder — only for left bubbles */}
        {!isRight && <Skeleton className="mb-1 h-3 w-16 rounded" />}
        <Skeleton
          className={`h-10 rounded-2xl ${width}`}
        />
      </div>
    </div>
  );
}

export function ChatSkeleton() {
  return (
    <div
      aria-label="Carregando mensagens"
      aria-busy="true"
      className="flex flex-col gap-4 px-4 py-3"
    >
      <BubbleSkeleton side="left" width="w-48" />
      <BubbleSkeleton side="left" width="w-64" />
      <BubbleSkeleton side="right" width="w-40" />
      <BubbleSkeleton side="left" width="w-56" />
      <BubbleSkeleton side="right" width="w-52" />
    </div>
  );
}
