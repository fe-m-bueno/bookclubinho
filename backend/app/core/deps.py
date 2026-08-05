import uuid
from collections.abc import AsyncGenerator
from typing import Annotated

import structlog
from fastapi import Cookie, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import InterfaceError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rls import apply_rls_user, get_rls_user_id
from app.core.security import extract_access_token_sub, extract_refresh_token_jti
from app.db.engine import AsyncSessionLocal
from app.db.models.group import GroupMember, GroupRole
from app.db.models.user import User
from app.services import membership

_NOT_RESOLVED: object = object()  # sentinel for "user not yet looked up"
logger = structlog.get_logger(__name__)


def _is_closed_connection_interface_error(exc: InterfaceError) -> bool:
    return "underlying connection is closed" in str(exc).lower()


async def get_session(request: Request) -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency — yields an async DB session for the duration of a request.
    Sets the RLS user context so PostgreSQL policies can enforce row-level access.
    Rolls back on any exception, always closes the session.

    The session is published on ``request.state`` so ``CommittingRoute`` can commit
    it while the request is still in flight. The commit below is the fallback for
    anything not served through that route class; by then the response has already
    been sent, which is why it can't be the only one — see app/api/route.py.
    """
    async with AsyncSessionLocal() as session:
        try:
            user_id = get_rls_user_id()
            if user_id:
                await apply_rls_user(session, user_id)
            request.state.db_session = session
            yield session
        except Exception:
            try:
                await session.rollback()
            except InterfaceError as exc:
                if not _is_closed_connection_interface_error(exc):
                    raise
                logger.warning("db_session_rollback_closed_connection", error=str(exc))
            raise
        else:
            try:
                await session.commit()
            except InterfaceError as exc:
                if not _is_closed_connection_interface_error(exc):
                    raise
                logger.warning("db_session_commit_closed_connection", error=str(exc))


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


async def get_group_membership(group_id: uuid.UUID, user: CurrentUser, db: DBSession) -> GroupMember:
    """Adapter: expose the membership module as a FastAPI dependency.

    The 404-not-403 policy and the ``Group.is_active`` filter live in
    ``app.services.membership`` — see that module before changing behaviour here.
    """
    return await membership.resolve(db, group_id, user.id)


GroupMemberDep = Annotated[GroupMember, Depends(get_group_membership)]


async def get_group_admin_membership(group_id: uuid.UUID, user: CurrentUser, db: DBSession) -> GroupMember:
    """Adapter: same seam, requiring the admin role."""
    return await membership.resolve(db, group_id, user.id, require_role=GroupRole.ADMIN)


GroupAdminDep = Annotated[GroupMember, Depends(get_group_admin_membership)]


async def get_current_refresh_jti(
    refresh_token: Annotated[str | None, Cookie(alias="refresh_token")] = None,
) -> str | None:
    """Extract JTI from refresh_token cookie without full validation.

    Used to identify the current session when listing sessions.
    Returns None if cookie is absent or token is malformed.
    """
    if not refresh_token:
        return None
    return extract_refresh_token_jti(refresh_token)


CurrentRefreshJTI = Annotated[str | None, Depends(get_current_refresh_jti)]
