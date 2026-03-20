import { QuotesClient } from "@/components/quotes/quotes-client";

export const metadata = { title: "Hall of Quotes" };

export default async function QuotesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <QuotesClient groupId={id} />;
}
