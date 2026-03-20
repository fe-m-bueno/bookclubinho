"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

/**
 * Returns a stable ref to the Next.js router instance.
 * Safe to pass to React Query `queryFn` callbacks that outlive the render.
 */
export function useRouterRef(): React.RefObject<AppRouterInstance> {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  return routerRef;
}
