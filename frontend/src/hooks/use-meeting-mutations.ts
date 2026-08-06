"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
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
    mutationFn: ({ meetingId, payload }) =>
      api.patch<MeetingResponse>(`/meetings/${meetingId}`, payload),
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
    mutationFn: async ({ meetingId, status }) => updateRsvpApi(meetingId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings", groupId] });
      queryClient.invalidateQueries({ queryKey: ["meetings-badge", groupId] });
    },
  });
}

export function useDeleteMeeting(groupId: string) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: deleteMeetingApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings", groupId] });
      queryClient.invalidateQueries({ queryKey: ["meetings-badge", groupId] });
    },
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
 * Standalone versions for meeting detail pages (outside group context).
 * These invalidate the ["meeting", meetingId] query instead of ["meetings", groupId].
 */

export function useUpdateRsvpStandalone(meetingId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    MeetingResponse,
    Error,
    { status: Exclude<RsvpStatus, "pending"> }
  >({
    mutationFn: async ({ status }) => updateRsvpApi(meetingId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meeting", meetingId] });
    },
  });
}

export function useDeleteMeetingStandalone() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: deleteMeetingApi,
    onSuccess: (_, meetingId) => {
      queryClient.invalidateQueries({ queryKey: ["meeting", meetingId] });
      queryClient.invalidateQueries({ queryKey: ["upcomingMeetings"] });
    },
  });
}

