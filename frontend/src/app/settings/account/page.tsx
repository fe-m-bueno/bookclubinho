import { Suspense } from "react";
import { AccountSettingsClient } from "@/components/settings/account-settings-client";
import { AccountSettingsSkeleton } from "@/components/settings/account-settings-skeleton";

export default function AccountSettingsPage() {
  return (
    <Suspense fallback={<AccountSettingsSkeleton />}>
      <AccountSettingsClient />
    </Suspense>
  );
}
