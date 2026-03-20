import { Bell } from "lucide-react";

export default function NotificationsPage() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
      <Bell className="h-12 w-12 text-muted-foreground" />
      <h2 className="text-lg font-semibold">Notificações</h2>
      <p className="text-muted-foreground text-sm">Em breve</p>
    </div>
  );
}
