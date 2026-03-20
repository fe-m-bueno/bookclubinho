import type { Metadata } from "next";
import { BadgesClient } from "@/components/badges/badges-client";

export const metadata: Metadata = { title: "Conquistas" };

export default function BadgesPage() {
  return <BadgesClient />;
}
