"""Testes unitários para app.services.quote."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.db.models.round import RoundStatus
from app.services.quote import QuoteError, create_quote, delete_quote, list_quotes, toggle_vote


# ── Mock factories ─────────────────────────────────────────────────────────────


def _make_round(**overrides: object) -> MagicMock:
    r = MagicMock()
    r.id = overrides.get("id", uuid.uuid4())
    r.group_id = overrides.get("group_id", uuid.uuid4())
    r.status = overrides.get("status", RoundStatus.READING)
    r.book_title = overrides.get("book_title", "Memórias Póstumas")
    r.book_author = overrides.get("book_author", "Machado de Assis")
    r.round_number = overrides.get("round_number", 1)
    return r


def _make_quote(**overrides: object) -> MagicMock:
    q = MagicMock()
    q.id = overrides.get("id", uuid.uuid4())
    q.group_id = overrides.get("group_id", uuid.uuid4())
    q.user_id = overrides.get("user_id", uuid.uuid4())
    q.quote_text = overrides.get("quote_text", "Ao vencedor as batatas.")
    q.page_reference = overrides.get("page_reference", None)
    q.book_title = overrides.get("book_title", "Memórias Póstumas")
    q.book_author = overrides.get("book_author", "Machado de Assis")
    q.round_id = overrides.get("round_id", uuid.uuid4())
    q.created_at = overrides.get("created_at", datetime(2026, 3, 20, 10, 0, 0, tzinfo=UTC))
    return q


# ── create_quote ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_quote_no_active_round() -> None:
    """Sem rodada ativa e round_id=None — levanta QuoteError 404."""
    group_id = uuid.uuid4()
    user_id = uuid.uuid4()

    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=res)

    with patch("app.services.quote.sanitize", side_effect=lambda x: x):
        # round_ será None → cria quote sem round, então nao levanta erro;
        # mas o teste verifica comportamento quando round_id explícito não é encontrado
        pass

    # Fornece um round_id explícito que não existe no grupo → deve levantar 404
    with pytest.raises(QuoteError) as exc_info:
        with patch("app.services.quote.sanitize", side_effect=lambda x: x):
            await create_quote(
                db,
                group_id=group_id,
                user_id=user_id,
                quote_text="Trecho qualquer",
                page_reference=None,
                round_id=uuid.uuid4(),
            )

    assert exc_info.value.status_code == 404
    assert "Rodada" in str(exc_info.value)


@pytest.mark.asyncio
async def test_create_quote_success() -> None:
    """round_id fornecido e encontrado — cria e retorna HallOfQuote."""
    group_id = uuid.uuid4()
    user_id = uuid.uuid4()
    round_id = uuid.uuid4()
    round_ = _make_round(id=round_id, group_id=group_id)

    db = AsyncMock()
    res_round = MagicMock()
    res_round.scalar_one_or_none.return_value = round_
    db.execute = AsyncMock(return_value=res_round)
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    with patch("app.services.quote.sanitize", side_effect=lambda x: x):
        result = await create_quote(
            db,
            group_id=group_id,
            user_id=user_id,
            quote_text="Ao vencedor as batatas.",
            page_reference="42",
            round_id=round_id,
        )

    db.add.assert_called_once()
    db.flush.assert_called_once()
    db.refresh.assert_called_once()


@pytest.mark.asyncio
async def test_create_quote_without_round_id_uses_active_round() -> None:
    """round_id=None — busca rodada ativa e cria quote normalmente."""
    group_id = uuid.uuid4()
    user_id = uuid.uuid4()
    round_ = _make_round(group_id=group_id, status=RoundStatus.READING)

    db = AsyncMock()
    res_round = MagicMock()
    res_round.scalar_one_or_none.return_value = round_
    db.execute = AsyncMock(return_value=res_round)
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    with patch("app.services.quote.sanitize", side_effect=lambda x: x):
        await create_quote(
            db,
            group_id=group_id,
            user_id=user_id,
            quote_text="Texto de teste",
            page_reference=None,
            round_id=None,
        )

    db.add.assert_called_once()
    added = db.add.call_args[0][0]
    assert added.user_id == user_id


# ── delete_quote ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_delete_quote_not_found() -> None:
    """Quote inexistente — levanta QuoteError 404."""
    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=res)

    with pytest.raises(QuoteError) as exc_info:
        await delete_quote(db, quote_id=uuid.uuid4(), user_id=uuid.uuid4())

    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_delete_quote_not_author() -> None:
    """Usuário não é autor da quote — levanta QuoteError 403."""
    owner_id = uuid.uuid4()
    other_id = uuid.uuid4()
    quote = _make_quote(user_id=owner_id)

    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = quote
    db.execute = AsyncMock(return_value=res)

    with pytest.raises(QuoteError) as exc_info:
        await delete_quote(db, quote_id=quote.id, user_id=other_id)

    assert exc_info.value.status_code == 403
    assert "autor" in str(exc_info.value)


@pytest.mark.asyncio
async def test_delete_quote_success() -> None:
    """Autor da quote chama delete — db.delete é invocado com o objeto correto."""
    user_id = uuid.uuid4()
    quote = _make_quote(user_id=user_id)

    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = quote
    db.execute = AsyncMock(return_value=res)
    db.delete = AsyncMock()

    await delete_quote(db, quote_id=quote.id, user_id=user_id)

    db.delete.assert_called_once_with(quote)


# ── toggle_vote ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_toggle_vote_not_found() -> None:
    """Quote inexistente — levanta QuoteError 404."""
    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=res)

    with pytest.raises(QuoteError) as exc_info:
        await toggle_vote(db, quote_id=uuid.uuid4(), user_id=uuid.uuid4())

    assert exc_info.value.status_code == 404
    assert "Quote" in str(exc_info.value)


@pytest.mark.asyncio
async def test_toggle_vote_adds_vote() -> None:
    """Nenhum voto existente — adiciona voto e retorna True."""
    user_id = uuid.uuid4()
    quote = _make_quote()

    db = AsyncMock()

    res_quote = MagicMock()
    res_quote.scalar_one_or_none.return_value = quote

    res_existing = MagicMock()
    res_existing.scalar_one_or_none.return_value = None  # sem voto anterior

    db.execute = AsyncMock(side_effect=[res_quote, res_existing])
    db.add = MagicMock()

    voted = await toggle_vote(db, quote_id=quote.id, user_id=user_id)

    assert voted is True
    db.add.assert_called_once()


@pytest.mark.asyncio
async def test_toggle_vote_removes_vote() -> None:
    """Voto já existe — remove e retorna False."""
    user_id = uuid.uuid4()
    quote = _make_quote()
    existing_vote = MagicMock()

    db = AsyncMock()

    res_quote = MagicMock()
    res_quote.scalar_one_or_none.return_value = quote

    res_existing = MagicMock()
    res_existing.scalar_one_or_none.return_value = existing_vote

    db.execute = AsyncMock(side_effect=[res_quote, res_existing])
    db.delete = AsyncMock()

    voted = await toggle_vote(db, quote_id=quote.id, user_id=user_id)

    assert voted is False
    db.delete.assert_called_once_with(existing_vote)


# ── list_quotes ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_quotes_empty() -> None:
    """Nenhuma quote no grupo — retorna tupla ([], None)."""
    group_id = uuid.uuid4()
    user_id = uuid.uuid4()

    db = AsyncMock()
    res = MagicMock()
    res.all.return_value = []
    db.execute = AsyncMock(return_value=res)

    quotes, next_cursor = await list_quotes(db, group_id=group_id, user_id=user_id)

    assert quotes == []
    assert next_cursor is None


@pytest.mark.asyncio
async def test_list_quotes_returns_results() -> None:
    """Quotes existentes — retorna lista serializada sem cursor quando abaixo do limite."""
    group_id = uuid.uuid4()
    user_id = uuid.uuid4()
    quote = _make_quote(group_id=group_id)

    # Simula uma row de resultado com os campos acessados por índice
    row = MagicMock()
    row.__getitem__ = lambda self, i: [
        quote,        # HallOfQuote
        "leitora",    # username
        "Leitora",    # display_name
        None,         # avatar_url
        0,            # vote_count
        False,        # did_i_vote
    ][i]

    db = AsyncMock()
    res = MagicMock()
    res.all.return_value = [row]
    db.execute = AsyncMock(return_value=res)

    quotes, next_cursor = await list_quotes(
        db, group_id=group_id, user_id=user_id, limit=20
    )

    assert len(quotes) == 1
    assert next_cursor is None


@pytest.mark.asyncio
async def test_list_quotes_pagination_cursor() -> None:
    """Mais quotes do que o limite — next_cursor é definido."""
    group_id = uuid.uuid4()
    user_id = uuid.uuid4()

    limit = 2

    def _make_row(quote: MagicMock) -> MagicMock:
        row = MagicMock()
        row.__getitem__ = lambda self, i: [
            quote, "user", "User", None, 0, False
        ][i]
        return row

    quotes_list = [_make_quote(group_id=group_id) for _ in range(3)]
    rows = [_make_row(q) for q in quotes_list]

    db = AsyncMock()
    res = MagicMock()
    res.all.return_value = rows  # 3 rows retornadas para limit=2
    db.execute = AsyncMock(return_value=res)

    result_quotes, next_cursor = await list_quotes(
        db, group_id=group_id, user_id=user_id, limit=limit
    )

    assert len(result_quotes) == limit
    assert next_cursor is not None
