"""O tipo de campo para senha.

A política em si mora em `app.core.security`, junto de `hash_password` — é lá que
ela precisa valer mesmo que um caminho novo esqueça de declarar o schema certo.
Aqui só existe a ponte para o Pydantic, que espera `ValueError` para montar o 422
no formato de erro de validação.
"""

from typing import Annotated

from pydantic import AfterValidator

from app.core.security import PasswordPolicyError, validate_password


def _check(v: str) -> str:
    try:
        return validate_password(v)
    except PasswordPolicyError as exc:
        raise ValueError(str(exc)) from exc


Password = Annotated[str, AfterValidator(_check)]
