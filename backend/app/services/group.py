"""Group business logic — validate, join, CRUD."""

from __future__ import annotations

import asyncio
import io
import uuid
from typing import TYPE_CHECKING

import structlog
from sqlalchemy import select
from sqlalchemy.orm import selectinload

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.db.models.user import User

import qrcode

from app.core.config import settings
from app.core.exceptions import ServiceError
from app.core.security import generate_group_code
from app.db.models.group import Group, GroupMember, GroupRole
from app.security.sanitizer import sanitize
from app.storage.s3_storage import get_public_url, upload_file

logger = structlog.get_logger(__name__)


class GroupError(ServiceError):
    """Raised when group validation fails."""


# ── Validation / Join (existing) ─────────────────────────────────────────────


async def validate_group_code(db: AsyncSession, code: str) -> Group:
    """Busca grupo pelo invite_code. Raise GroupError(404) se nao encontrar."""
    result = await db.execute(
        select(Group).where(Group.invite_code == code.upper()).options(selectinload(Group.members))
    )
    group = result.scalar_one_or_none()
    if group is None:
        raise GroupError("Clube não encontrado.", status_code=404)
    if not group.is_active:
        raise GroupError("Este clube foi desativado.", status_code=410)
    return group


async def join_group(db: AsyncSession, user: User, invite_code: str) -> Group:
    """Adiciona usuario ao grupo. Valida: existe, nao e membro, nao esta cheio."""
    group = await validate_group_code(db, invite_code)

    is_member = any(m.user_id == user.id for m in group.members)
    if is_member:
        raise GroupError("Você já faz parte deste clube.", status_code=409)

    if len(group.members) >= group.max_members:
        raise GroupError("Este clube está cheio.", status_code=403)

    member = GroupMember(user_id=user.id, group_id=group.id, role=GroupRole.MEMBER)
    db.add(member)

    logger.info("group_joined", user_id=str(user.id), group_id=str(group.id))
    return group


async def leave_group(db: AsyncSession, user: User, group_id: uuid.UUID) -> None:
    """Remove usuario do grupo com promoção de admin e desativação se necessário."""
    result = await db.execute(
        select(Group)
        .where(Group.id == group_id, Group.is_active.is_(True))
        .options(selectinload(Group.members))
    )
    group = result.scalar_one_or_none()
    if group is None:
        raise GroupError("Clube não encontrado.", status_code=404)

    member = next((m for m in group.members if m.user_id == user.id), None)
    if member is None:
        raise GroupError("Clube não encontrado.", status_code=404)

    active_members = group.members

    if len(active_members) == 1:
        # Último membro — desativar grupo
        group.is_active = False
        await db.delete(member)
        logger.info("group_deactivated_last_member", group_id=str(group_id), user_id=str(user.id))
        return

    if member.role == GroupRole.ADMIN:
        other_admins = [
            m for m in active_members
            if m.user_id != user.id and m.role == GroupRole.ADMIN
        ]
        if not other_admins:
            # Promover membro mais antigo
            other_members = [
                m for m in active_members
                if m.user_id != user.id
            ]
            oldest = min(other_members, key=lambda m: m.joined_at)
            oldest.role = GroupRole.ADMIN
            logger.info(
                "group_admin_promoted",
                group_id=str(group_id),
                promoted_user_id=str(oldest.user_id),
            )

    await db.delete(member)
    logger.info("group_left", group_id=str(group_id), user_id=str(user.id))


# ── QR Code / Regenerate ─────────────────────────────────────────────────────

def _generate_qr_bytes(url: str) -> bytes:
    """Generate a QR code PNG image for the given URL."""
    img = qrcode.make(url)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


async def _upload_qr_code(group_id: uuid.UUID, code: str) -> str:
    """Generate QR code image and upload to R2."""
    join_url = f"{settings.APP_URL.rstrip('/')}/join/{code}"

    def _generate_and_upload() -> str:
        qr_bytes = _generate_qr_bytes(join_url)
        return upload_file(f"qrcodes/{group_id}.webp", qr_bytes, "image/png")

    return await asyncio.to_thread(_generate_and_upload)


def get_qr_url(group_id: uuid.UUID) -> str:
    """Return deterministic QR code URL for a group."""
    return get_public_url(f"qrcodes/{group_id}.webp")


async def regenerate_invite_code(
    db: AsyncSession, group_id: uuid.UUID
) -> tuple[str, str]:
    """Generate a new invite code and QR code for the group."""
    result = await db.execute(
        select(Group).where(Group.id == group_id, Group.is_active.is_(True))
    )
    group = result.scalar_one_or_none()
    if group is None:
        raise GroupError("Clube não encontrado.", status_code=404)

    code = await _generate_unique_code(db, max_retries=5)
    group.invite_code = code
    qr_url = await _upload_qr_code(group_id, code)
    logger.info("invite_code_regenerated", group_id=str(group_id))
    return code, qr_url


# ── CRUD ─────────────────────────────────────────────────────────────────────

_MAX_CODE_RETRIES = 3


async def _generate_unique_code(db: AsyncSession, max_retries: int = _MAX_CODE_RETRIES) -> str:
    """Generate an invite code that doesn't collide with existing ones."""
    for _ in range(max_retries):
        code = generate_group_code()
        result = await db.execute(select(Group.id).where(Group.invite_code == code))
        if result.scalar_one_or_none() is None:
            return code
    raise GroupError("Falha ao gerar código único. Tente novamente.", status_code=500)


def _validate_name(name: str) -> str:
    name = sanitize(name).strip()
    if len(name) < 2 or len(name) > 60:
        raise GroupError("Nome deve ter entre 2 e 60 caracteres.", status_code=422)
    return name


def _validate_description(description: str | None) -> str | None:
    if description is None:
        return None
    description = sanitize(description).strip()
    if len(description) > 500:
        raise GroupError("Descrição deve ter no máximo 500 caracteres.", status_code=422)
    return description or None


_MAX_PHOTO_SIZE = 5 * 1024 * 1024  # 5 MB


def _validate_photo_size(photo_data: bytes) -> None:
    if len(photo_data) > _MAX_PHOTO_SIZE:
        raise GroupError("Foto deve ter no máximo 5 MB.", status_code=422)


async def _upload_group_photo(
    group_id: uuid.UUID, photo_data: bytes, photo_content_type: str | None
) -> str:
    _validate_photo_size(photo_data)
    return await asyncio.to_thread(
        upload_file,
        f"groups/{group_id}.webp",
        photo_data,
        photo_content_type or "image/webp",
    )


async def create_group(
    db: AsyncSession,
    user: User,
    name: str,
    description: str | None = None,
    photo_data: bytes | None = None,
    photo_content_type: str | None = None,
) -> Group:
    """Create a new group and add the creator as admin."""
    name = _validate_name(name)
    description = _validate_description(description)

    invite_code = await _generate_unique_code(db)

    group_id = uuid.uuid4()
    photo_url: str | None = None

    if photo_data:
        photo_url = await _upload_group_photo(group_id, photo_data, photo_content_type)

    group = Group(
        id=group_id,
        name=name,
        description=description,
        photo_url=photo_url,
        invite_code=invite_code,
        created_by=user.id,
    )
    member = GroupMember(
        user_id=user.id,
        group_id=group_id,
        role=GroupRole.ADMIN,
    )
    db.add(group)
    db.add(member)
    await db.flush()

    logger.info("group_created", group_id=str(group_id), user_id=str(user.id))
    return group


async def list_user_groups(db: AsyncSession, user: User) -> list[Group]:
    """List all active groups the user belongs to."""
    result = await db.execute(
        select(GroupMember)
        .join(Group, GroupMember.group_id == Group.id)
        .where(GroupMember.user_id == user.id, Group.is_active.is_(True))
        .options(selectinload(GroupMember.group).selectinload(Group.members))
    )
    memberships = result.scalars().all()
    return [m.group for m in memberships]


async def get_group_detail(db: AsyncSession, group_id: uuid.UUID) -> Group:
    """Fetch a single group with members and their user profiles."""
    result = await db.execute(
        select(Group)
        .where(Group.id == group_id, Group.is_active.is_(True))
        .options(selectinload(Group.members).selectinload(GroupMember.user))
    )
    group = result.scalar_one_or_none()
    if group is None:
        raise GroupError("Clube não encontrado.", status_code=404)
    return group


async def update_group(
    db: AsyncSession,
    group_id: uuid.UUID,
    name: str | None = None,
    description: str | None = None,
    photo_data: bytes | None = None,
    photo_content_type: str | None = None,
) -> Group:
    """Update mutable group fields. Only non-None values are applied."""
    result = await db.execute(select(Group).where(Group.id == group_id, Group.is_active.is_(True)))
    group = result.scalar_one_or_none()
    if group is None:
        raise GroupError("Clube não encontrado.", status_code=404)

    if name is not None:
        group.name = _validate_name(name)

    if description is not None:
        group.description = _validate_description(description)

    if photo_data:
        group.photo_url = await _upload_group_photo(group_id, photo_data, photo_content_type)

    logger.info("group_updated", group_id=str(group_id))
    return group


async def _get_active_group_with_members(
    db: AsyncSession, group_id: uuid.UUID
) -> Group:
    """Fetch an active group with eagerly loaded members, or raise 404."""
    result = await db.execute(
        select(Group)
        .where(Group.id == group_id, Group.is_active.is_(True))
        .options(selectinload(Group.members))
    )
    group = result.scalar_one_or_none()
    if group is None:
        raise GroupError("Clube não encontrado.", status_code=404)
    return group


def _find_member_or_raise(group: Group, user_id: uuid.UUID) -> GroupMember:
    """Find a member in the group's loaded members, or raise 404."""
    target = next((m for m in group.members if m.user_id == user_id), None)
    if target is None:
        raise GroupError("Membro não encontrado.", status_code=404)
    return target


async def update_member_role(
    db: AsyncSession,
    group_id: uuid.UUID,
    target_user_id: uuid.UUID,
    new_role: GroupRole,
    requesting_user_id: uuid.UUID,
) -> GroupMember:
    """Update a member's role within a group (admin only)."""
    group = await _get_active_group_with_members(db, group_id)
    target = _find_member_or_raise(group, target_user_id)

    # Prevent demoting self if sole admin
    if (
        target.user_id == requesting_user_id
        and target.role == GroupRole.ADMIN
        and new_role == GroupRole.MEMBER
    ):
        other_admins = [
            m for m in group.members
            if m.user_id != requesting_user_id and m.role == GroupRole.ADMIN
        ]
        if not other_admins:
            raise GroupError(
                "Você é o único admin. Promova outro membro antes de se rebaixar.",
                status_code=403,
            )

    target.role = new_role
    logger.info(
        "member_role_updated",
        group_id=str(group_id),
        target_user_id=str(target_user_id),
        new_role=new_role,
    )
    return target


async def remove_group_member(
    db: AsyncSession,
    group_id: uuid.UUID,
    target_user_id: uuid.UUID,
    requesting_user_id: uuid.UUID,
) -> None:
    """Remove a member from the group (admin only). Admin cannot remove themselves."""
    if target_user_id == requesting_user_id:
        raise GroupError(
            "Use a opção 'Sair do grupo' para remover a si mesmo.",
            status_code=400,
        )

    group = await _get_active_group_with_members(db, group_id)
    target = _find_member_or_raise(group, target_user_id)

    await db.delete(target)
    logger.info(
        "member_removed",
        group_id=str(group_id),
        target_user_id=str(target_user_id),
        removed_by=str(requesting_user_id),
    )


async def soft_delete_group(db: AsyncSession, group_id: uuid.UUID) -> None:
    """Soft-delete a group by setting is_active = False."""
    result = await db.execute(select(Group).where(Group.id == group_id, Group.is_active.is_(True)))
    group = result.scalar_one_or_none()
    if group is None:
        raise GroupError("Clube não encontrado.", status_code=404)

    group.is_active = False
    logger.info("group_deleted", group_id=str(group_id))
