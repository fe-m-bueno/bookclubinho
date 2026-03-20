import { StatsClient } from "@/components/stats/stats-client";

export const metadata = { title: "Stats" };

export default async function StatsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StatsClient groupId={id} />;
}
