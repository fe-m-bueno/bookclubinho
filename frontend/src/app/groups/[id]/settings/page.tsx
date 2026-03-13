import type { Metadata } from "next";
import { GroupSettingsClient } from "@/components/groups/group-settings-client";

export const metadata: Metadata = {
  title: "Configurações",
};

export default function GroupSettingsPage() {
  return <GroupSettingsClient />;
}
