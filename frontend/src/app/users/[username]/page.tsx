import type { Metadata } from "next";
import { UserProfileClient } from "@/components/users/user-profile-client";

interface Props {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return {
    // Só o identificador, como em toda outra página: nenhuma delas repete o
    // nome do site no título, e as duas que repetiam faziam isso com um
    // travessão.
    title: `@${username}`,
    description: `Perfil de @${username} no Bookclub`,
  };
}

export default async function UserProfilePage({ params }: Props) {
  const { username } = await params;
  return <UserProfileClient username={username} />;
}
