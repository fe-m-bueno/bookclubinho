import { GroupLayoutShell } from "@/components/groups/group-layout-shell";

export default async function GroupLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <GroupLayoutShell groupId={id}>{children}</GroupLayoutShell>;
}
