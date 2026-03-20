"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ensureCsrf, withCsrf } from "@/lib/csrf";
import type {
  MeetingCreatePayload,
  MeetingResponse,
  RsvpStatus,
} from "@/lib/types/meeting";

export function useCreateMeeting(groupId: string) {
  const queryClient = useQueryClient();

  return useMutation<MeetingResponse, Error, MeetingCreatePayload>({
    mutationFn: async (payload) => {
      await ensureCsrf();
      const res = await fetch(`/api/v1/groups/${groupId}/meetings`, {
        method: "POST",
        headers: withCsrf({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Erro ao criar encontro");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings", groupId] });
      queryClient.invalidateQueries({ queryKey: ["meetings-badge", groupId] });
    },
  });
}

export function useUpdateMeeting(groupId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    MeetingResponse,
    Error,
    { meetingId: string; payload: Partial<MeetingCreatePayload> }
  >({
    mutationFn: async ({ meetingId, payload }) => {
      await ensureCsrf();
      const res = await fetch(`/api/v1/meetings/${meetingId}`, {
        method: "PATCH",
        headers: withCsrf({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Erro ao atualizar encontro");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings", groupId] });
      queryClient.invalidateQueries({ queryKey: ["meetings-badge", groupId] });
    },
  });
}

export function useUpdateRsvp(groupId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    MeetingResponse,
    Error,
    { meetingId: string; status: Exclude<RsvpStatus, "pending"> }
  >({
    mutationFn: async ({ meetingId, status }) => {
      await ensureCsrf();
      const res = await fetch(`/api/v1/meetings/${meetingId}/rsvp`, {
        method: "POST",
        headers: withCsrf({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Erro ao atualizar RSVP");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings", groupId] });
      queryClient.invalidateQueries({ queryKey: ["meetings-badge", groupId] });
    },
  });
}

export function useDeleteMeeting(groupId: string) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (meetingId) => {
      await ensureCsrf();
      const res = await fetch(`/api/v1/meetings/${meetingId}`, {
        method: "DELETE",
        headers: withCsrf(),
        credentials: "include",
      });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Erro ao cancelar encontro");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings", groupId] });
      queryClient.invalidateQueries({ queryKey: ["meetings-badge", groupId] });
    },
  });
}

export function useDownloadIcs() {
  return useMutation<void, Error, string>({
    mutationFn: async (meetingId) => {
      await ensureCsrf();
      const res = await fetch(`/api/v1/meetings/${meetingId}/calendar`, {
        method: "POST",
        headers: withCsrf(),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Erro ao gerar arquivo .ics");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `meeting-${meetingId}.ics`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
  });
}

