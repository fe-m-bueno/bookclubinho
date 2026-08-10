import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import jwt
import structlog
from jwt import PyJWTError

from app.core.config import settings
from app.core.exceptions import ServiceError

logger = structlog.get_logger(__name__)


MIN_PASSWORD_LENGTH = 8

# Limite do próprio algoritmo: bcrypt só considera os primeiros 72 bytes. Até a
# versão 3.x a biblioteca truncava em silêncio; da 4.x em diante ela levanta
# ValueError. Truncar por conta própria seria pior que recusar — faria duas
# senhas diferentes autenticarem a mesma conta.
MAX_PASSWORD_BYTES = 72


class PasswordPolicyError(ServiceError):
    """Senha fora da política.

    Herda de ServiceError para virar 422 pelo handler da aplicação, e não 500.
    """

    def __init__(self, message: str) -> None:
        super().__init__(message, status_code=422)


def validate_password(plain: str) -> str:
    """A política de senha, em um lugar só.

    A regra dos 8 caracteres estava escrita três vezes — dois validadores Pydantic
    e uma checagem no serviço de conta — e o limite superior, em nenhuma.
    """
    if len(plain) < MIN_PASSWORD_LENGTH:
        raise PasswordPolicyError(f"A senha deve ter pelo menos {MIN_PASSWORD_LENGTH} caracteres.")
    if len(plain.encode("utf-8")) > MAX_PASSWORD_BYTES:
        # Em bytes, não em caracteres: uma frase com acentos chega ao limite
        # antes do que o comprimento visível sugere.
        raise PasswordPolicyError(
            f"A senha é longa demais (máximo {MAX_PASSWORD_BYTES} bytes; acentos e emoji contam mais de um byte cada)."
        )
    return plain


def hash_password(password: str) -> str:
    # A validação mora aqui, e não só nos schemas, para que nenhum caminho de
    # escrita de senha possa esquecê-la.
    validate_password(password)
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Senha confere?

    Nunca levanta. bcrypt recusa hash malformado e senha acima de 72 bytes com
    ValueError, e os dois casos são "não confere", não erro de servidor: um hash
    fora do padrão não pode autenticar ninguém, e uma senha longa demais não pode
    ser a senha de conta nenhuma, já que `hash_password` a recusaria.

    Importa porque `authenticate_user` se esforça para responder sempre a mesma
    coisa — hash dummy em tempo constante, mensagem genérica, contador de falhas.
    Uma exceção escapando dali sai como 500 com traceback no log.
    """
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        logger.warning("password_verify_rejected_input")
        return False


_RESERVED_CLAIMS = frozenset({"sub", "exp", "type", "jti"})


def _safe_extra(extra_claims: dict[str, Any] | None) -> dict[str, Any]:
    if not extra_claims:
        return {}
    return {k: v for k, v in extra_claims.items() if k not in _RESERVED_CLAIMS}


def create_access_token(
    subject: str | Any,
    expires_delta: timedelta | None = None,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    expire = datetime.now(UTC) + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    payload: dict[str, Any] = {
        **_safe_extra(extra_claims),
        "sub": str(subject),
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(
    subject: str | Any,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    expire = datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload: dict[str, Any] = {
        **_safe_extra(extra_claims),
        "sub": str(subject),
        "exp": expire,
        "type": "refresh",
        "jti": secrets.token_urlsafe(16),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_token_pair(
    subject: str,
    *,
    onboarding_completed: bool,
) -> tuple[str, str]:
    """Cria par access+refresh com claim de onboarding."""
    claims = {"onb": onboarding_completed}
    return (
        create_access_token(subject, extra_claims=claims),
        create_refresh_token(subject, extra_claims=claims),
    )


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])


def extract_access_token_sub(token: str) -> str | None:
    """Decode an access JWT and return the ``sub`` claim, or None on any failure."""
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            return None
        return payload.get("sub")
    except PyJWTError:
        return None


def safe_compare(a: str, b: str) -> bool:
    """Constant-time string comparison to prevent timing attacks."""
    return hmac.compare_digest(a.encode(), b.encode())


# Excludes ambiguous chars: 0, O, 1, I, L
_GROUP_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def generate_group_code() -> str:
    """Generate a cryptographically secure 8-char invite code, excluding ambiguous characters."""
    return "".join(secrets.choice(_GROUP_CODE_ALPHABET) for _ in range(8))


def generate_magic_token() -> str:
    """Generate a cryptographically secure URL-safe token for magic link auth."""
    return secrets.token_urlsafe(32)


# ── Personal access tokens ────────────────────────────────────────────────────

PAT_PREFIX = "bcp_"
_PAT_SECRET_BYTES = 32
_PAT_DISPLAY_CHARS = 8


def generate_personal_access_token() -> str:
    """Token opaco de 256 bits, prefixado para ser reconhecível.

    O prefixo não é decoração: é o que permite recusar um Authorization que
    obviamente não é um PAT antes de gastar um SELECT, e é o que os scanners de
    segredo vazado (GitHub, gitleaks) usam para achar um token colado num
    repositório público.
    """
    return f"{PAT_PREFIX}{secrets.token_urlsafe(_PAT_SECRET_BYTES)}"


def hash_personal_access_token(token: str) -> str:
    """SHA-256 hex do token, que é o que vai para o banco.

    SHA-256 e não bcrypt — o contrário do que se faz com senha, de propósito.
    bcrypt é lento *para atrapalhar quem adivinha*, e só existe porque senha
    humana vive num espaço de busca pequeno. Este token são 256 bits que nós
    sorteamos: não há o que adivinhar. O que sobraria do bcrypt aqui é só o
    custo — ~100ms em *toda* requisição autenticada por token, contra ~1µs
    deste hash. Um vazamento do banco também não é explorável: sem o token em
    claro, o hash não autentica nada.
    """
    return hashlib.sha256(token.encode()).hexdigest()


def personal_access_token_prefix(token: str) -> str:
    """Os primeiros caracteres do token, guardados em claro só para exibição.

    É como o usuário reconhece qual linha da lista é qual token sem que a gente
    precise saber o segredo — o mesmo truque do `ghp_xxxx…` do GitHub.
    """
    return token[: len(PAT_PREFIX) + _PAT_DISPLAY_CHARS]


def extract_refresh_token_jti(token: str) -> str | None:
    """Extract JTI from a refresh token without validating expiry.

    Returns the JTI string or None on any failure.
    Used for identifying the current session when listing sessions.
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            options={"verify_exp": False},
        )
        if payload.get("type") != "refresh":
            return None
        return payload.get("jti")
    except PyJWTError:
        return None
