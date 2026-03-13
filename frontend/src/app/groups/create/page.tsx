import type { Metadata } from "next";
import { CreateGroupWizard } from "@/components/groups/create-group-wizard";

export const metadata: Metadata = {
  title: "Criar Clube",
};

export default function CreateGroupPage() {
  return <CreateGroupWizard />;
}
