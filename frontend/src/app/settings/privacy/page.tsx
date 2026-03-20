import { Shield } from "lucide-react";

export default function PrivacyPage() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
      <Shield className="h-12 w-12 text-muted-foreground" />
      <h2 className="text-lg font-semibold">Dados e Privacidade</h2>
      <p className="text-muted-foreground text-sm">Em breve</p>
    </div>
  );
}
