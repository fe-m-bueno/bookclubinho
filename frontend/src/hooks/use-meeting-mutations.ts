"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { invalidateMeetings } from "@/lib/query-keys";
import type {
  MeetingCreatePayload,
  MeetingResponse,
  RsvpStatus,
} from "@/lib/types/meeting";

/**
 * API call helpers to eliminate duplication between group-context and standalone mutations.
 */

const updateRsvpApi = (meetingId: string, status: RsvpStatus) =>
  api.post<MeetingResponse>(`/meetings/${meetingId}/rsvp`, { status });

const deleteMeetingApi = (meetingId: string) =>
  api.del<void>(`/meetings/${meetingId}`);

export function useCreateMeeting(groupId: string) {
  const queryClient = useQueryClient();

  return useMutation<MeetingResponse, Error, MeetingCreatePayload>({
    mutationFn: (payload) =>
      api.post<MeetingResponse>(`/groups/${groupId}/meetings`, payload),
    onSuccess: () => invalidateMeetings(queryClient),
  });
}

/**
 * As três mutações abaixo ainda recebem `groupId` porque é o que as páginas de
 * clube chamam, mas a invalidação não depende mais dele — era justamente essa
 * dependência que impedia os caminhos `Standalone` de invalidar o mesmo
 * conjunto.
 */

export function useUpdateMeeting(_groupId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    MeetingResponse,
    Error,
    { meetingId: string; payload: Partial<MeetingCreatePayload> }
  >({
    mutationFn: ({ meetingId, payload }) =>
      api.patch<MeetingResponse>(`/meetings/${meetingId}`, payload),
    onSuccess: () => invalidateMeetings(queryClient),
  });
}

export function useUpdateRsvp(_groupId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    MeetingResponse,
    Error,
    { meetingId: string; status: Exclude<RsvpStatus, "pending"> }
  >({
    mutationFn: async ({ meetingId, status }) => updateRsvpApi(meetingId, status),
    onSuccess: () => invalidateMeetings(queryClient),
  });
}

export function useDeleteMeeting(_groupId: string) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: deleteMeetingApi,
    onSuccess: () => invalidateMeetings(queryClient),
  });
}

export function useDownloadIcs() {
  return useMutation<void, Error, string>({
    mutationFn: async (meetingId) => {
      const blob = await api.blob(`/meetings/${meetingId}/calendar`);
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

/**
 * Versões para a página de detalhe do encontro, fora do contexto de clube.
 *
 * A diferença é só o que a mutação recebe: aqui o `meetingId` vem do escopo do
 * hook, não do argumento. O conjunto de caches invalidado é o mesmo — é o que
 * `invalidateMeetings` garante, e o que antes divergia entre os dois caminhos.
 */

export function useUpdateRsvpStandalone(meetingId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    MeetingResponse,
    Error,
    { status: Exclude<RsvpStatus, "pending"> }
  >({
    mutationFn: async ({ status }) => updateRsvpApi(meetingId, status),
    onSuccess: () => invalidateMeetings(queryClient),
  });
}

export function useDeleteMeetingStandalone() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: deleteMeetingApi,
    onSuccess: () => invalidateMeetings(queryClient),
  });
}
