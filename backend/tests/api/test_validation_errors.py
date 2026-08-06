"""O corpo de um 422 não pode devolver o que o usuário mandou.

Por padrão o FastAPI inclui `input` em cada erro de validação — o valor exato
que falhou. Numa senha rejeitada isso significa a senha em texto puro no corpo
da resposta, e daí em qualquer lugar que registre respostas de erro: log de
proxy, Sentry, breadcrumb do cliente. `ctx` vai junto porque carrega o objeto de
exceção do validador.

O que sobra — `loc`, `msg`, `type` — é o suficiente para o frontend apontar o
campo errado.
"""

from __future__ import annotations

from fastapi.testclient import TestClient
from main import app

SENHA = "uma-frase-senha-longa-demais-para-o-bcrypt-aguentar-sem-reclamar-mesmo"


def _register(payload: dict[str, str]):
    return TestClient(app, raise_server_exceptions=False).post("/api/v1/auth/register", json=payload)


class TestValidationErrorBody:
    def test_senha_rejeitada_nao_volta_no_corpo(self) -> None:
        resposta = _register({"email": "a@b.com", "password": SENHA * 2, "display_name": "X"})

        assert resposta.status_code == 422
        assert SENHA not in resposta.text

    def test_corpo_ainda_diz_qual_campo_e_por_que(self) -> None:
        resposta = _register({"email": "a@b.com", "password": SENHA * 2, "display_name": "X"})

        erro = resposta.json()["detail"][0]
        assert erro["loc"] == ["body", "password"]
        assert "longa demais" in erro["msg"]
        assert "input" not in erro
        assert "ctx" not in erro

    def test_vale_para_qualquer_campo_nao_so_senha(self) -> None:
        # E-mail inválido também era ecoado de volta.
        resposta = _register(
            {
                "email": "nao-e-email-mas-e-identificavel@",
                "password": "SenhaValida1",
                "display_name": "X",
            }
        )

        assert resposta.status_code == 422
        assert "nao-e-email-mas-e-identificavel" not in resposta.text
