"""Guarda contra reintroduzir o molde de política que quebra sob RLS.

As 63 políticas que a 0026 teve de reescrever nasceram de um `_UID` copiado de
migration em migration. O erro não é raro nem sutil de cometer — é o caminho
natural de quem abre a migration anterior e copia o topo.

`current_setting(..., true)` devolve string vazia depois que um `set_config`
local termina, e `''::uuid` **levanta erro** em vez de não casar. Numa conexão
de pool isso aborta a transação da segunda requisição em diante.
"""

from __future__ import annotations

import re
from pathlib import Path

_VERSOES = Path(__file__).resolve().parents[2] / "alembic" / "versions"

# A 0026 é a que conserta as antigas: ela contém o texto inseguro de propósito,
# como agulha da substituição. A 0027 restaura o estado anterior no downgrade.
_ISENTAS = {"0026", "0027"}

# Antes da 0024 é história: aquelas migrations já rodaram em produção com o
# molde antigo, e é a 0026 que as corrige em tempo de execução. Reescrevê-las
# aqui não mudaria o banco de ninguém.
_PRIMEIRA_COBRADA = 24

_UID_INSEGURO = re.compile(r"current_setting\(\s*'app\.current_user_id'\s*,\s*true\s*\)\s*::\s*uuid")


def _numero(caminho: Path) -> int:
    m = re.match(r"^(\d+)", caminho.name)
    return int(m.group(1)) if m else -1


def test_migrations_novas_usam_uid_null_safe() -> None:
    infratoras: list[str] = []

    for caminho in sorted(_VERSOES.glob("*.py")):
        numero = _numero(caminho)
        if numero < _PRIMEIRA_COBRADA or f"{numero:04d}" in _ISENTAS:
            continue

        for n, linha in enumerate(caminho.read_text().splitlines(), start=1):
            if _UID_INSEGURO.search(linha) and "nullif" not in linha.lower():
                infratoras.append(f"{caminho.name}:{n}: {linha.strip()}")

    assert not infratoras, (
        "Política com cast direto de `current_setting` para uuid. Use "
        "`nullif(current_setting('app.current_user_id', true), '')::uuid` — a GUC "
        "vale string vazia depois que a transação que a setou termina, e ''::uuid "
        "levanta erro em vez de não casar:\n  " + "\n  ".join(infratoras)
    )


def test_o_guarda_realmente_pega_o_molde_antigo() -> None:
    """O teste acima só vale se a expressão casar com o molde que existia."""
    antigo = "_UID = \"current_setting('app.current_user_id', true)::uuid\""
    novo = "_UID = \"nullif(current_setting('app.current_user_id', true), '')::uuid\""

    assert _UID_INSEGURO.search(antigo)
    assert "nullif" not in antigo.lower()
    assert "nullif" in novo.lower()
