"use client";

import { createContext, useContext, useMemo } from "react";
import type { GroupDetailResponse } from "@/lib/types/group";

interface GroupContextValue {
  group: GroupDetailResponse;
  refetch: () => void;
}

const GroupContext = createContext<GroupContextValue | null>(null);

export function GroupProvider({
  group,
  refetch,
  children,
}: GroupContextValue & { children: React.ReactNode }) {
  const value = useMemo(() => ({ group, refetch }), [group, refetch]);
  return (
    <GroupContext.Provider value={value}>
      {children}
    </GroupContext.Provider>
  );
}

export function useGroup(): GroupContextValue {
  const ctx = useContext(GroupContext);
  if (!ctx) {
    throw new Error("useGroup must be used within a GroupProvider");
  }
  return ctx;
}
