"""O contexto RLS precisa sobreviver ao request inteiro, não só à primeira transação.

Todos os quatro comportamentos aqui existem porque o app conecta como
superusuário — que não avalia política — e por isso nada disso jamais falhou
em produção. Sob um papel comum, cada um deles é um erro de banco no meio de
uma requisição.
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.rls import (
    _auth_lookup_on,
    _current_user_id,
    auth_lookup,
    disable_auth_lookup,
    enable_auth_lookup,
    reapply_context_on_new_transaction,
)


def _sql_de(chamada: object) -> str:
    return str(chamada[0][0])  # type: ignore[index]


class TestReapplyOnNewTransaction:
    def test_reapplies_user_when_a_new_transaction_begins(self) -> None:
        """`set_config(..., true)` morre no commit; há request que commita no meio."""
        uid = str(uuid.uuid4())
        token = _current_user_id.set(uid)
        connection = MagicMock()
        try:
            reapply_context_on_new_transaction(None, None, connection)
        finally:
            _current_user_id.reset(token)

        connection.execute.assert_called_once()
        assert connection.execute.call_args[0][1] == {"uid": uid}

    def test_never_writes_an_empty_user_id(self) -> None:
        """String vazia não converte para uuid: seria erro de query, não 'não casa'."""
        token = _current_user_id.set("")
        connection = MagicMock()
        try:
            reapply_context_on_new_transaction(None, None, connection)
        finally:
            _current_user_id.reset(token)

        connection.execute.assert_not_called()

    def test_reapplies_the_auth_lookup_hatch(self) -> None:
        token = _auth_lookup_on.set(True)
        connection = MagicMock()
        try:
            reapply_context_on_new_transaction(None, None, connection)
        finally:
            _auth_lookup_on.reset(token)

        assert connection.execute.call_count == 1
        assert connection.execute.call_args[0][1] == {"estado": "on"}

    def test_writes_nothing_when_there_is_no_context(self) -> None:
        connection = MagicMock()
        reapply_context_on_new_transaction(None, None, connection)
        connection.execute.assert_not_called()


class TestAuthLookupHatch:
    @pytest.mark.asyncio
    async def test_enable_marks_the_contextvar_so_it_survives_a_commit(self) -> None:
        session = AsyncMock()
        try:
            await enable_auth_lookup(session)
            assert _auth_lookup_on.get() is True
            assert session.execute.call_args[0][1] == {"estado": "on"}
        finally:
            _auth_lookup_on.set(False)

    @pytest.mark.asyncio
    async def test_disable_clears_it(self) -> None:
        session = AsyncMock()
        await enable_auth_lookup(session)
        await disable_auth_lookup(session)

        assert _auth_lookup_on.get() is False
        assert session.execute.call_args[0][1] == {"estado": "off"}

    @pytest.mark.asyncio
    async def test_context_manager_closes_the_hatch(self) -> None:
        session = AsyncMock()
        async with auth_lookup(session):
            assert _auth_lookup_on.get() is True
        assert _auth_lookup_on.get() is False

    @pytest.mark.asyncio
    async def test_failure_inside_does_not_mask_the_real_error(self) -> None:
        """A transação abortada faz o `set_config` de saída levantar também.

        Se o desligamento rodasse num `finally`, a exceção que sobe seria
        "current transaction is aborted" e a causa real desapareceria.
        """

        class ErroDeVerdade(Exception):
            pass

        session = AsyncMock()
        session.execute = AsyncMock(side_effect=[None, RuntimeError("transaction is aborted")])

        with pytest.raises(ErroDeVerdade):
            async with auth_lookup(session):
                raise ErroDeVerdade

        assert _auth_lookup_on.get() is False
