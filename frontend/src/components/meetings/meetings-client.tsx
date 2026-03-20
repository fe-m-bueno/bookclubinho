"use client";

import { useState } from "react";
import { Calendar, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useGroup } from "@/lib/contexts/group-context";
import { useMeetings } from "@/hooks/use-meetings";
import { MeetingCard } from "./meeting-card";
import { MeetingSkeleton } from "./meeting-skeleton";
import { CreateMeetingDialog } from "./create-meeting-dialog";

export function MeetingsClient() {
  const { group } = useGroup();
  const [createOpen, setCreateOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"upcoming" | "past">("upcoming");

  const { meetings, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useMeetings({ groupId: group.id, filter: activeTab });

  const currentMember = group.members.find(
    (m) => m.user_id === group.current_user_id,
  );
  const isAdmin = currentMember?.role === "admin";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button
            variant={activeTab === "upcoming" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("upcoming")}
          >
            Próximos
          </Button>
          <Button
            variant={activeTab === "past" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("past")}
          >
            Passados
          </Button>
        </div>

        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Novo Encontro
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <MeetingSkeleton />
      ) : meetings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Calendar className="h-12 w-12 text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground text-sm">
            {activeTab === "upcoming"
              ? "Nenhum encontro agendado"
              : "Nenhum encontro passado"}
          </p>
          {activeTab === "upcoming" && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setCreateOpen(true)}
            >
              Agendar encontro
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {meetings.map((meeting) => (
            <MeetingCard
              key={meeting.id}
              meeting={meeting}
              groupId={group.id}
              currentUserId={group.current_user_id}
              isAdmin={isAdmin}
            />
          ))}

          {hasNextPage && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? "Carregando..." : "Ver mais"}
              </Button>
            </div>
          )}
        </div>
      )}

      <CreateMeetingDialog
        groupId={group.id}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </div>
  );
}
