import re

import pytest

from app.core.security import (
    _GROUP_CODE_ALPHABET,
    MAX_PASSWORD_BYTES,
    MIN_PASSWORD_LENGTH,
    PasswordPolicyError,
    generate_group_code,
    generate_magic_token,
    hash_password,
    verify_password,
)

AMBIGUOUS_CHARS = set("0O1IL")


class TestGenerateGroupCode:
    def test_length(self) -> None:
        assert len(generate_group_code()) == 8

    def test_only_allowed_chars(self) -> None:
        code = generate_group_code()
        assert all(c in _GROUP_CODE_ALPHABET for c in code)

    def test_no_ambiguous_chars(self) -> None:
        for _ in range(200):
            code = generate_group_code()
            assert not AMBIGUOUS_CHARS.intersection(code), f"Ambiguous char in: {code}"

    def test_uniqueness(self) -> None:
        codes = {generate_group_code() for _ in range(500)}
        # Probability of collision in 500 draws from 31^8 ≈ 8.5e11 space is negligible
        assert len(codes) == 500


class TestGenerateMagicToken:
    def test_length(self) -> None:
        # secrets.token_urlsafe(32) → 43 URL-safe base64 chars
        token = generate_magic_token()
        assert len(token) == 43

    def test_url_safe_chars(self) -> None:
        token = generate_magic_token()
        assert re.fullmatch(r"[A-Za-z0-9_\-]+", token), f"Non URL-safe char in: {token}"

    def test_uniqueness(self) -> None:
        tokens = {generate_magic_token() for _ in range(200)}
        assert len(tokens) == 200


class TestPasswordHashing:
    """bcrypt levanta ValueError em dois casos, e nenhum deles é falha de programação.

    Um é hash guardado fora do padrão; o outro é senha acima de 72 bytes, que o
    usuário alcança digitando. Ambos saíam como 500 — o primeiro contradizendo
    "respostas de auth sempre idênticas", o segundo quebrando o cadastro.
    """

    def test_round_trip(self) -> None:
        h = hash_password("SenhaForte!2026")
        assert verify_password("SenhaForte!2026", h)
        assert not verify_password("outra-senha", h)

    def test_hash_corrompido_nao_autentica_e_nao_levanta(self) -> None:
        # bcrypt diz "Invalid salt"; para o chamador isso é credencial inválida.
        for corrompido in ("", "nao-e-um-hash", "$2b$12$curto"):
            assert verify_password("qualquer", corrompido) is False

    def test_senha_longa_no_login_nao_levanta(self) -> None:
        h = hash_password("SenhaForte!2026")
        assert verify_password("a" * 200, h) is False

    def test_hash_recusa_senha_acima_do_limite(self) -> None:
        with pytest.raises(PasswordPolicyError):
            hash_password("a" * (MAX_PASSWORD_BYTES + 1))

    def test_limite_e_em_bytes_nao_em_caracteres(self) -> None:
        # 40 caracteres acentuados passam de 72 bytes em UTF-8.
        acentuada = "ç" * 40
        assert len(acentuada) < MAX_PASSWORD_BYTES
        assert len(acentuada.encode("utf-8")) > MAX_PASSWORD_BYTES
        with pytest.raises(PasswordPolicyError):
            hash_password(acentuada)

    def test_no_limite_exato_ainda_passa(self) -> None:
        assert verify_password("a" * MAX_PASSWORD_BYTES, hash_password("a" * MAX_PASSWORD_BYTES))

    def test_recusa_senha_curta(self) -> None:
        with pytest.raises(PasswordPolicyError):
            hash_password("a" * (MIN_PASSWORD_LENGTH - 1))

    def test_mensagem_nao_vaza_detalhe_interno(self) -> None:
        with pytest.raises(PasswordPolicyError) as exc:
            hash_password("a" * 200)
        texto = str(exc.value).lower()
        assert "bcrypt" not in texto and "salt" not in texto
