import type { Metadata } from "next";
import { UserProfileClient } from "@/components/users/user-profile-client";

interface Props {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `@${username} — Clube do Livro`,
    description: `Perfil de @${username} no Bookclub`,
  };
}

export default async function UserProfilePage({ params }: Props) {
  const { username } = await params;
  return <UserProfileClient username={username} />;
}
