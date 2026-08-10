"""O modo `--once` do worker de notificações — o que o cron do Actions roda."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.workers.notification import (
    HEARTBEAT_KEY,
    ONCE_HEARTBEAT_TTL,
    _read_and_process_batch,
    run_once,
)


def _redis_falso(lotes: list[list[tuple[str, dict[str, str]]]]) -> AsyncMock:
    """Redis cujo `xreadgroup` devolve os lotes em ordem e depois nada."""
    fila = [*lotes, []]

    async def _xreadgroup(**_kwargs: object) -> object:
        mensagens = fila.pop(0) if fila else []
        return [("bookclub:notifications", mensagens)] if mensagens else []

    redis = AsyncMock()
    redis.xreadgroup = AsyncMock(side_effect=_xreadgroup)
    redis.zrangebyscore = AsyncMock(return_value=[])
    return redis


class TestLeituraSemBloqueio:
    @pytest.mark.asyncio
    async def test_nao_usa_block_zero(self) -> None:
        """`BLOCK 0` em Redis é bloquear para sempre, não "não bloqueie".

        Foi assim que a primeira versão travou: o job ficava pendurado até o
        timeout do socket em vez de sair com o stream vazio.
        """
        redis = _redis_falso([])
        await _read_and_process_batch(redis, block_ms=None)

        assert redis.xreadgroup.await_args.kwargs["block"] is None

    @pytest.mark.asyncio
    async def test_conta_o_que_leu_e_nao_o_que_deu_certo(self) -> None:
        """Quem chama usa o retorno para saber se o stream secou.

        Contar só os sucessos faria um lote inteiro de falhas parecer fim de
        fila, e a drenagem pararia com eventos ainda pendentes.
        """
        redis = _redis_falso([[("1-1", {"type": "x"}), ("1-2", {"type": "y"})]])

        with patch("app.workers.notification.process_event", AsyncMock(side_effect=RuntimeError("falhou"))):
            lidos = await _read_and_process_batch(redis, block_ms=None)

        assert lidos == 2
        redis.xack.assert_not_awaited()  # falhou, então não confirma


class TestRunOnce:
    @pytest.mark.asyncio
    async def test_drena_ate_o_stream_secar(self) -> None:
        redis = _redis_falso([[("1-1", {"type": "a"})], [("2-1", {"type": "b"})]])

        with (
            patch("app.workers.notification.aioredis.from_url", return_value=redis),
            patch("app.workers.notification.process_event", AsyncMock()),
        ):
            await run_once()

        assert redis.xack.await_count == 2

    @pytest.mark.asyncio
    async def test_heartbeat_cobre_o_intervalo_do_cron(self) -> None:
        """Para job em lote, "vivo" é "rodou há pouco", não "está rodando".

        Com o TTL de 90s do daemon, o /health passaria quase todo o intervalo
        dizendo `error` mesmo com tudo funcionando.
        """
        redis = _redis_falso([])

        with patch("app.workers.notification.aioredis.from_url", return_value=redis):
            await run_once()

        chave, _valor = redis.set.await_args.args
        assert chave == HEARTBEAT_KEY
        assert redis.set.await_args.kwargs["ex"] == ONCE_HEARTBEAT_TTL
        assert ONCE_HEARTBEAT_TTL > 10 * 60  # o intervalo do cron

    @pytest.mark.asyncio
    async def test_fecha_a_conexao_mesmo_se_falhar(self) -> None:
        redis = MagicMock()
        redis.set = AsyncMock(side_effect=RuntimeError("redis caiu"))
        redis.aclose = AsyncMock()

        with (
            patch("app.workers.notification.aioredis.from_url", return_value=redis),
            pytest.raises(RuntimeError),
        ):
            await run_once()

        redis.aclose.assert_awaited_once()
