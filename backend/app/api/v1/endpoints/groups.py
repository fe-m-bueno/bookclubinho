"""
Group endpoints — CRUD + validate/join.

Routes /validate/{code} and /join are registered BEFORE /{group_id}
to avoid path-param conflicts.
"""

from __future__ import annotations

import uuid  # noqa: TC003

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile

from app.core.deps import (  # noqa: TC001
    CurrentUser,
    DBSession,
    GroupAdminDep,
    GroupMemberDep,
)
from app.db.models.group import GroupRole
from app.schemas.group import (
    GroupCreateResponse,
    GroupDetailResponse,
    GroupJoinRequest,
    GroupJoinResponse,
    GroupListItem,
    GroupListResponse,
    GroupValidateResponse,
    LastMessagePreview,
    MemberAvatar,
    MemberRoleUpdateRequest,
    MemberRoleUpdateResponse,
    MemberSummary,
    MessageResponse,
    MyReadingProgress,
    QrCodeResponse,
    RegenerateCodeResponse,
    RoundSummary,
)
from app.services.badge_checker import check_and_award_badges
from app.services.group import (
    GroupError,
    create_group,
    get_group_detail,
    get_qr_url,
    join_group,
    leave_group,
    list_user_groups_enriched,
    regenerate_invite_code,
    remove_group_member,
    soft_delete_group,
    update_group,
    update_member_role,
    validate_group_code,
)

router = APIRouter(tags=["groups"])


async def _read_upload(photo: UploadFile | None) -> tuple[bytes | None, str | None]:
    """Extract bytes and content type from an optional UploadFile.

    Note: ``photo.size`` may be ``None`` or ``0`` for browser FormData uploads
    where the multipart part omits ``Content-Length``.  We read the bytes first
    and discard only if truly empty.  The ``isinstance`` check is intentionally
    omitted because FastAPI re-exports its own ``UploadFile`` which may differ
    from the Starlette class at runtime.
    """
    if photo is not None and hasattr(photo, "read"):
        data = await photo.read()
        if data:
            return data, photo.content_type
    return None, None


# ── Validate / Join (existing, BEFORE /{group_id}) ───────────────────────────


@router.get(
    "/validate/{code}",
    response_model=GroupValidateResponse,
    summary="Validar codigo de convite",
)
async def validate_code(code: str, db: DBSession) -> GroupValidateResponse:
    """Verifica se um codigo de convite e valido e retorna dados do grupo."""
    try:
        group = await validate_group_code(db=db, code=code)
    except GroupError:
        return GroupValidateResponse(valid=False)
    return GroupValidateResponse(
        valid=True,
        name=group.name,
        photo_url=group.photo_url,
        member_count=len(group.members),
    )


@router.post(
    "/join",
    response_model=GroupJoinResponse,
    summary="Entrar em um grupo via codigo",
)
async def join_group_endpoint(body: GroupJoinRequest, db: DBSession, user: CurrentUser) -> GroupJoinResponse:
    """Adiciona o usuario autenticado a um grupo via codigo de convite."""
    try:
        group = await join_group(db=db, user=user, invite_code=body.invite_code)
    except GroupError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return GroupJoinResponse(message="Você entrou no clube!", group_id=str(group.id))


# ── CRUD ─────────────────────────────────────────────────────────────────────


@router.post(
    "/",
    response_model=GroupCreateResponse,
    status_code=201,
    summary="Criar novo grupo",
)
async def create_group_endpoint(
    db: DBSession,
    user: CurrentUser,
    background_tasks: BackgroundTasks,
    name: str = Form(..., min_length=2, max_length=60),
    description: str | None = Form(None, max_length=500),
    photo: UploadFile | None = File(None),  # noqa: B008
) -> GroupCreateResponse:
    """Cria um novo grupo e adiciona o criador como admin."""
    photo_data, photo_content_type = await _read_upload(photo)

    try:
        group = await create_group(
            db=db,
            user=user,
            name=name,
            description=description,
            photo_data=photo_data,
            photo_content_type=photo_content_type,
        )
    except GroupError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    # Commit antes de agendar o BackgroundTask: o badge checker abre sua própria
    # sessão e não consegue ver dados não-commitados de outras transações.
    # Sem isso, _check_founder encontra 0 grupos e a badge nunca é concedida.
    await db.commit()

    background_tasks.add_task(
        check_and_award_badges,
        str(user.id),
        "group_created",
        {"group_id": str(group.id)},
    )

    return GroupCreateResponse(
        id=str(group.id),
        name=group.name,
        description=group.description,
        photo_url=group.photo_url,
        invite_code=group.invite_code,
        created_at=group.created_at,
    )


@router.get(
    "/",
    response_model=GroupListResponse,
    summary="Listar grupos do usuario",
)
async def list_groups_endpoint(
    db: DBSession,
    user: CurrentUser,
) -> GroupListResponse:
    """Lista todos os grupos ativos do usuario autenticado com dados enriquecidos."""
    enriched = await list_user_groups_enriched(db=db, user=user)
    items = []
    for e in enriched:
        g = e["group"]
        cr = e["current_round"]
        rp = e["my_reading_progress"]
        lm = e["last_message"]

        items.append(
            GroupListItem(
                id=str(g.id),
                name=g.name,
                photo_url=g.photo_url,
                member_count=len(g.members),
                members_preview=[
                    MemberAvatar(
                        user_id=str(m.user_id),
                        display_name=m.user.display_name,
                        avatar_url=m.user.avatar_url,
                    )
                    for m in g.members[:4]
                ],
                current_round=RoundSummary(
                    id=str(cr.id),
                    round_number=cr.round_number,
                    status=cr.status,
                    book_title=cr.book_title,
                    book_author=cr.book_author,
                    book_cover_url=cr.book_cover_url,
                    book_page_count=cr.book_page_count,
                )
                if cr
                else None,
                my_reading_progress=MyReadingProgress(
                    current_page=rp.current_page,
                    total_pages=rp.total_pages,
                    percentage=rp.percentage,
                )
                if rp
                else None,
                last_message_preview=LastMessagePreview(
                    sender_display_name=lm.user.display_name,
                    sender_avatar_url=lm.user.avatar_url,
                    content_text=lm.content_text,
                    content_type=lm.content_type,
                    created_at=lm.created_at,
                )
                if lm
                else None,
                last_activity_at=e["last_activity_at"],
            )
        )

    return GroupListResponse(groups=items)


@router.get(
    "/{group_id}",
    response_model=GroupDetailResponse,
    summary="Detalhar grupo",
)
async def get_group_endpoint(
    db: DBSession,
    user: CurrentUser,
    member: GroupMemberDep,
) -> GroupDetailResponse:
    """Retorna detalhes completos do grupo (apenas para membros)."""
    try:
        group = await get_group_detail(db=db, group_id=member.group_id)
    except GroupError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    show_invite_code = member.role == GroupRole.ADMIN

    return GroupDetailResponse(
        id=str(group.id),
        name=group.name,
        description=group.description,
        photo_url=group.photo_url,
        invite_code=group.invite_code if show_invite_code else None,
        max_members=group.max_members,
        member_count=len(group.members),
        members=[
            MemberSummary(
                user_id=str(m.user_id),
                username=m.user.username,
                display_name=m.user.display_name,
                avatar_url=m.user.avatar_url,
                role=m.role,
                joined_at=m.joined_at,
            )
            for m in group.members
        ],
        current_user_id=str(user.id),
        created_at=group.created_at,
    )


@router.post(
    "/{group_id}/leave",
    response_model=MessageResponse,
    summary="Sair do grupo",
)
async def leave_group_endpoint(
    db: DBSession,
    user: CurrentUser,
    member: GroupMemberDep,
) -> MessageResponse:
    """Remove o usuario autenticado do grupo."""
    try:
        await leave_group(db=db, user=user, group_id=member.group_id)
    except GroupError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return MessageResponse(message="Você saiu do clube.")


@router.post(
    "/{group_id}/regenerate-code",
    response_model=RegenerateCodeResponse,
    summary="Regenerar codigo de convite",
)
async def regenerate_code_endpoint(
    db: DBSession,
    user: CurrentUser,
    admin: GroupAdminDep,
) -> RegenerateCodeResponse:
    """Gera novo codigo de convite e QR code (apenas admins)."""
    try:
        code, qr_url = await regenerate_invite_code(db=db, group_id=admin.group_id)
    except GroupError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return RegenerateCodeResponse(invite_code=code, qr_url=qr_url)


@router.get(
    "/{group_id}/qr",
    response_model=QrCodeResponse,
    summary="Obter URL do QR code",
)
async def get_qr_endpoint(
    user: CurrentUser,
    member: GroupMemberDep,
) -> QrCodeResponse:
    """Retorna a URL do QR code do grupo (apenas membros)."""
    return QrCodeResponse(qr_url=get_qr_url(member.group_id))


@router.patch(
    "/{group_id}",
    response_model=MessageResponse,
    summary="Atualizar grupo",
)
async def update_group_endpoint(
    db: DBSession,
    user: CurrentUser,
    admin: GroupAdminDep,
    name: str | None = Form(None, min_length=2, max_length=60),
    description: str | None = Form(None, max_length=500),
    photo: UploadFile | None = File(None),  # noqa: B008
) -> MessageResponse:
    """Atualiza dados do grupo (apenas admins)."""
    photo_data, photo_content_type = await _read_upload(photo)

    try:
        await update_group(
            db=db,
            group_id=admin.group_id,
            name=name,
            description=description,
            photo_data=photo_data,
            photo_content_type=photo_content_type,
        )
    except GroupError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return MessageResponse(message="Clube atualizado com sucesso!")


@router.patch(
    "/{group_id}/members/{user_id}",
    response_model=MemberRoleUpdateResponse,
    summary="Atualizar role de membro",
)
async def update_member_role_endpoint(
    user_id: uuid.UUID,
    body: MemberRoleUpdateRequest,
    db: DBSession,
    user: CurrentUser,
    admin: GroupAdminDep,
) -> MemberRoleUpdateResponse:
    """Atualiza o role de um membro do grupo (apenas admins)."""
    try:
        member = await update_member_role(
            db=db,
            group_id=admin.group_id,
            target_user_id=user_id,
            new_role=GroupRole(body.role),
            requesting_user_id=user.id,
        )
    except GroupError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return MemberRoleUpdateResponse(
        user_id=str(member.user_id),
        role=member.role,
        message="Role atualizado com sucesso!",
    )


@router.delete(
    "/{group_id}/members/{user_id}",
    response_model=MessageResponse,
    summary="Remover membro do grupo",
)
async def remove_member_endpoint(
    user_id: uuid.UUID,
    db: DBSession,
    user: CurrentUser,
    admin: GroupAdminDep,
) -> MessageResponse:
    """Remove um membro do grupo (apenas admins)."""
    try:
        await remove_group_member(
            db=db,
            group_id=admin.group_id,
            target_user_id=user_id,
            requesting_user_id=user.id,
        )
    except GroupError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return MessageResponse(message="Membro removido com sucesso!")


@router.delete(
    "/{group_id}",
    response_model=MessageResponse,
    summary="Deletar grupo",
)
async def delete_group_endpoint(
    db: DBSession,
    user: CurrentUser,
    admin: GroupAdminDep,
) -> MessageResponse:
    """Soft-delete do grupo (apenas admins)."""
    try:
        await soft_delete_group(db=db, group_id=admin.group_id)
    except GroupError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return MessageResponse(message="Clube removido com sucesso!")
