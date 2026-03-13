"""
Group endpoints — CRUD + validate/join.

Routes /validate/{code} and /join are registered BEFORE /{group_id}
to avoid path-param conflicts.
"""

from __future__ import annotations

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

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
    MemberSummary,
    MessageResponse,
    QrCodeResponse,
    RegenerateCodeResponse,
)
from app.services.group import (
    GroupError,
    create_group,
    get_group_detail,
    get_qr_url,
    join_group,
    leave_group,
    list_user_groups,
    regenerate_invite_code,
    soft_delete_group,
    update_group,
    validate_group_code,
)

router = APIRouter(tags=["groups"])


async def _read_upload(photo: UploadFile | None) -> tuple[bytes | None, str | None]:
    """Extract bytes and content type from an optional UploadFile."""
    if photo and isinstance(photo, UploadFile) and photo.size:
        return await photo.read(), photo.content_type
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
async def join_group_endpoint(
    body: GroupJoinRequest, db: DBSession, user: CurrentUser
) -> GroupJoinResponse:
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
    """Lista todos os grupos ativos do usuario autenticado."""
    groups = await list_user_groups(db=db, user=user)
    return GroupListResponse(
        groups=[
            GroupListItem(
                id=str(g.id),
                name=g.name,
                photo_url=g.photo_url,
                member_count=len(g.members),
            )
            for g in groups
        ]
    )


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
