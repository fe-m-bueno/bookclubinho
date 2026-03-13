"use client";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  AvatarGroup,
  AvatarGroupCount,
} from "@/components/ui/avatar";
import type { MemberSummary } from "@/lib/types/group";

function getInitials(member: MemberSummary): string {
  const name = member.display_name || member.username || "?";
  return name.charAt(0).toUpperCase();
}

interface MemberAvatarStackProps {
  members: MemberSummary[];
  max?: number;
}

export function MemberAvatarStack({
  members,
  max = 4,
}: MemberAvatarStackProps) {
  const visible = members.slice(0, max);
  const overflow = members.length - max;

  return (
    <AvatarGroup>
      {visible.map((member) => (
        <Avatar key={member.user_id} size="sm">
          {member.avatar_url && (
            <AvatarImage
              src={member.avatar_url}
              alt={member.display_name || member.username || "Membro"}
            />
          )}
          <AvatarFallback>{getInitials(member)}</AvatarFallback>
        </Avatar>
      ))}
      {overflow > 0 && (
        <AvatarGroupCount>
          <span className="text-xs">+{overflow}</span>
        </AvatarGroupCount>
      )}
    </AvatarGroup>
  );
}
