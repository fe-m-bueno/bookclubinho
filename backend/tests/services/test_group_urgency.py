"""Ordem da home: o que cobra ação primeiro, depois o que tem prazo.

A home ordenava por `last_activity_at`, o que põe no topo o clube que mais
conversa — não o clube que precisa de você. Uma votação que fecha amanhã e
espera só o seu voto ficava abaixo de um clube sem rodada nenhuma onde alguém
mandou um "kkkk" há dez minutos.

`_urgency_key` é pura de propósito: a decisão de ordem se testa sem banco.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Any
from unittest.mock import MagicMock

from app.db.models.round import RoundStatus
from app.services.group import _urgency_key

HOJE = datetime.now(UTC).date()


def _item(
    *,
    status: str | None = None,
    deadline: date | None = None,
    needs_my_action: bool = False,
    activity_days_ago: int = 0,
) -> dict[str, Any]:
    round_ = None
    if status is not None:
        round_ = MagicMock()
        round_.status = status
        round_.deadline = deadline
    return {
        "current_round": round_,
        "needs_my_action": needs_my_action,
        "last_activity_at": datetime.now(UTC) - timedelta(days=activity_days_ago),
    }


def _ordenados(itens: dict[str, dict[str, Any]]) -> list[str]:
    return [nome for nome, _ in sorted(itens.items(), key=lambda kv: _urgency_key(kv[1]))]


class TestUrgencia:
    def test_o_que_espera_por_mim_vem_antes_do_que_so_conversa(self) -> None:
        ordem = _ordenados(
            {
                "tagarela": _item(activity_days_ago=0),
                "espera_meu_voto": _item(
                    status=RoundStatus.VOTING,
                    deadline=HOJE + timedelta(days=1),
                    needs_my_action=True,
                    activity_days_ago=9,
                ),
            }
        )
        assert ordem == ["espera_meu_voto", "tagarela"]

    def test_entre_dois_que_esperam_por_mim_vence_o_prazo_mais_curto(self) -> None:
        ordem = _ordenados(
            {
                "fecha_em_uma_semana": _item(
                    status=RoundStatus.VOTING,
                    deadline=HOJE + timedelta(days=7),
                    needs_my_action=True,
                ),
                "fecha_amanha": _item(
                    status=RoundStatus.VOTING,
                    deadline=HOJE + timedelta(days=1),
                    needs_my_action=True,
                ),
            }
        )
        assert ordem == ["fecha_amanha", "fecha_em_uma_semana"]

    def test_prazo_vencido_vem_na_frente_de_todos(self) -> None:
        # Dias negativos, e não um caso especial: atrasado é o prazo mais curto
        # que existe, e a aritmética já diz isso.
        ordem = _ordenados(
            {
                "hoje": _item(status=RoundStatus.VOTING, deadline=HOJE, needs_my_action=True),
                "atrasado": _item(
                    status=RoundStatus.VOTING,
                    deadline=HOJE - timedelta(days=3),
                    needs_my_action=True,
                ),
            }
        )
        assert ordem == ["atrasado", "hoje"]

    def test_rodada_aberta_vem_antes_de_clube_sem_rodada(self) -> None:
        ordem = _ordenados(
            {
                "sem_rodada": _item(activity_days_ago=0),
                "lendo": _item(
                    status=RoundStatus.READING,
                    deadline=HOJE + timedelta(days=30),
                    activity_days_ago=20,
                ),
            }
        )
        assert ordem == ["lendo", "sem_rodada"]

    def test_rodada_com_prazo_vem_antes_de_rodada_sem_prazo(self) -> None:
        ordem = _ordenados(
            {
                "sem_prazo": _item(status=RoundStatus.READING, deadline=None),
                "com_prazo": _item(status=RoundStatus.READING, deadline=HOJE + timedelta(days=60)),
            }
        )
        assert ordem == ["com_prazo", "sem_prazo"]

    def test_atividade_desempata_o_que_e_igual(self) -> None:
        # O critério antigo não sumiu: virou o último degrau.
        ordem = _ordenados(
            {
                "parado": _item(activity_days_ago=30),
                "recente": _item(activity_days_ago=1),
            }
        )
        assert ordem == ["recente", "parado"]

    def test_ja_votei_entao_a_rodada_nao_me_cobra_nada(self) -> None:
        # Mesma fase, mesmo prazo — o que muda é `needs_my_action`.
        ordem = _ordenados(
            {
                "ja_votei": _item(
                    status=RoundStatus.VOTING,
                    deadline=HOJE + timedelta(days=1),
                    needs_my_action=False,
                ),
                "falta_eu": _item(
                    status=RoundStatus.VOTING,
                    deadline=HOJE + timedelta(days=5),
                    needs_my_action=True,
                ),
            }
        )
        assert ordem == ["falta_eu", "ja_votei"]
