import uuid
from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, Request, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rls import get_rls_user_id
from app.core.security import extract_access_token_sub
from app.db.engine import AsyncSessionLocal
from app.db.models.group import Group, GroupMember, GroupRole
from app.db.models.user import User

_NOT_RESOLVED: object = object()  # sentinel for "user not yet looked up"


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency — yields an async DB session for the duration of a request.
    Sets the RLS user context so PostgreSQL policies can enforce row-level access.
    Commits on success, rolls back on any exception, always closes the session.
    """
    async with AsyncSessionLocal() as session:
        try:
            user_id = get_rls_user_id()
            if user_id:
                await session.execute(
                    text("SET LOCAL app.current_user_id = :uid"),
                    {"uid": user_id},
                )
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


DBSession = Annotated[AsyncSession, Depends(get_session)]


async def get_current_user_id(
    access_token: Annotated[str | None, Cookie(alias="access_token")] = None,
) -> str:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Não autenticado",
    )
    if not access_token:
        raise credentials_exception
    user_id = extract_access_token_sub(access_token)
    if user_id is None:
        raise credentials_exception
    return user_id


CurrentUserID = Annotated[str, Depends(get_current_user_id)]


async def _resolve_user(
    request: Request,
    db: AsyncSession,
    access_token: str | None,
) -> User | None:
    """Shared logic for resolving a User from an access_token cookie.

    Returns the User or None. Results are cached on ``request.state``.
    Uses the RLS ContextVar when available to avoid a redundant JWT decode.
    """
    if not access_token:
        return None

    cached = getattr(request.state, "_resolved_user", _NOT_RESOLVED)
    if cached is not _NOT_RESOLVED:
        return cached  # type: ignore[return-value]

    # Prefer the already-decoded user_id from RLS middleware (avoids extra JWT decode)
    user_id = get_rls_user_id() or extract_access_token_sub(access_token)
    if user_id is None:
        request.state._resolved_user = None
        return None

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    request.state._resolved_user = user
    return user


async def get_current_user(
    request: Request,
    db: DBSession,
    access_token: Annotated[str | None, Cookie(alias="access_token")] = None,
) -> User:
    user = await _resolve_user(request, db, access_token)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Não autenticado.",
        )
    return user


async def get_current_active_user(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Conta desativada.",
        )
    return user


async def get_optional_user(
    request: Request,
    db: DBSession,
    access_token: Annotated[str | None, Cookie(alias="access_token")] = None,
) -> User | None:
    return await _resolve_user(request, db, access_token)


CurrentUser = Annotated[User, Depends(get_current_active_user)]
OptionalUser = Annotated[User | None, Depends(get_optional_user)]


async def get_group_membership(
    group_id: uuid.UUID, user: CurrentUser, db: DBSession
) -> GroupMember:
    """Resolve the authenticated user's membership in the given group.

    Returns 404 (not 403) to avoid leaking group existence.
    """
    result = await db.execute(
        select(GroupMember)
        .join(Group, GroupMember.group_id == Group.id)
        .where(
            GroupMember.user_id == user.id,
            GroupMember.group_id == group_id,
            Group.is_active.is_(True),
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clube não encontrado.",
        )
    return member


GroupMemberDep = Annotated[GroupMember, Depends(get_group_membership)]


async def get_group_admin_membership(member: GroupMemberDep) -> GroupMember:
    """Require the resolved member to have the admin role."""
    if member.role != GroupRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas administradores podem realizar esta ação.",
        )
    return member


GroupAdminDep = Annotated[GroupMember, Depends(get_group_admin_membership)]
