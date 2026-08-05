"""Contrato do módulo de membership — o único lugar que responde
"este usuário pertence a este clube, e com qual role?".

Antes deste módulo a mesma pergunta tinha 4 implementações e duas delas não
filtravam `Group.is_active`. Os testes de filtro abaixo são o que impede a
regressão.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.db.models.group import Group, GroupMember, GroupRole
from app.services.membership import (
    DEFAULT_NOT_FOUND_MESSAGE,
    MembershipError,
    resolve,
)
from tests.conftest import make_member, mock_db_returning


class TestResolveMembership:
    @pytest.mark.asyncio
    async def test_returns_member_row(self) -> None:
        member = make_member(role=GroupRole.MEMBER)
        db = mock_db_returning(member)

        result = await resolve(db, uuid.uuid4(), member.user_id)

        assert result is member

    @pytest.mark.asyncio
    async def test_non_member_raises_404_not_403(self) -> None:
        """404 para não vazar a existência do clube."""
        db = mock_db_returning(None)

        with pytest.raises(MembershipError) as exc_info:
            await resolve(db, uuid.uuid4(), uuid.uuid4())

        assert exc_info.value.status_code == 404
        assert str(exc_info.value) == DEFAULT_NOT_FOUND_MESSAGE

    @pytest.mark.asyncio
    async def test_caller_can_override_not_found_message(self) -> None:
        """As rotas de round dizem "Rodada não encontrada." para que sondar um
        round_id não distinga rodada-inexistente de rodada-de-outro-clube."""
        db = mock_db_returning(None)

        with pytest.raises(MembershipError) as exc_info:
            await resolve(
                db,
                uuid.uuid4(),
                uuid.uuid4(),
                not_found_message="Rodada não encontrada.",
            )

        assert str(exc_info.value) == "Rodada não encontrada."
        assert exc_info.value.status_code == 404


class TestRolePolicy:
    @pytest.mark.asyncio
    async def test_admin_passes_admin_requirement(self) -> None:
        member = make_member(role=GroupRole.ADMIN)
        db = mock_db_returning(member)

        result = await resolve(db, uuid.uuid4(), member.user_id, require_role=GroupRole.ADMIN)

        assert result is member

    @pytest.mark.asyncio
    async def test_member_fails_admin_requirement_with_403(self) -> None:
        """403, não 404: o pertencimento já foi estabelecido, não há o que esconder."""
        member = make_member(role=GroupRole.MEMBER)
        db = mock_db_returning(member)

        with pytest.raises(MembershipError) as exc_info:
            await resolve(db, uuid.uuid4(), member.user_id, require_role=GroupRole.ADMIN)

        assert exc_info.value.status_code == 403
        assert "administradores" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_no_role_requirement_accepts_admin(self) -> None:
        member = make_member(role=GroupRole.ADMIN)
        db = mock_db_returning(member)

        assert await resolve(db, uuid.uuid4(), member.user_id) is member


class TestSoftDeleteFilter:
    """Regressão: duas das quatro implementações antigas não filtravam
    `Group.is_active`, então membro de clube soft-deleted continuava escrevendo."""

    @pytest.mark.asyncio
    async def test_query_joins_group_and_filters_is_active(self) -> None:
        member = make_member()
        db = mock_db_returning(member)

        await resolve(db, member.group_id, member.user_id)

        stmt = db.execute.await_args.args[0]
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": True}))

        assert "JOIN groups" in compiled
        assert "groups.is_active" in compiled

    @pytest.mark.asyncio
    async def test_filters_on_both_user_and_group(self) -> None:
        member = make_member()
        db = mock_db_returning(member)
        group_id = uuid.uuid4()
        user_id = uuid.uuid4()

        await resolve(db, group_id, user_id)

        stmt = db.execute.await_args.args[0]
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": True}))

        # literal_binds renderiza UUID sem hífens
        assert group_id.hex in compiled
        assert user_id.hex in compiled

    @pytest.mark.asyncio
    async def test_selects_group_member_rows(self) -> None:
        member = make_member()
        db = mock_db_returning(member)

        await resolve(db, member.group_id, member.user_id)

        stmt = db.execute.await_args.args[0]
        assert isinstance(stmt, type(select(GroupMember)))
        assert "group_members" in str(stmt.compile(compile_kwargs={"literal_binds": True}))


class TestErrorType:
    def test_membership_error_is_a_service_error(self) -> None:
        """Herdar de ServiceError é o que faz o handler global de main.py
        converter para o status correto quando o endpoint só captura o tipo
        de erro do próprio service (ChatError, RoundError, ...)."""
        from app.core.exceptions import ServiceError

        assert issubclass(MembershipError, ServiceError)

    def test_group_model_has_soft_delete_flag(self) -> None:
        """Se `is_active` sair do model, o filtro acima passa a ser silenciosamente
        inútil — este teste falha primeiro."""
        assert hasattr(Group, "is_active")
