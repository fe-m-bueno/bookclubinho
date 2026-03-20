import { WrappedClient } from "@/components/wrapped/wrapped-client";

export const metadata = { title: "Wrapped" };

export default async function WrappedPage({
  params,
}: {
  params: Promise<{ id: string; year: string }>;
}) {
  const { id, year } = await params;
  return <WrappedClient groupId={id} year={parseInt(year, 10)} />;
}
