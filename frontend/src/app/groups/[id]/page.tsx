import { redirect } from "next/navigation";

export default async function GroupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/groups/${id}/chat`);
}
