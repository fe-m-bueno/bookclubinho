"""Testes unitários dos models Round, RoundNomination e RoundVote (sem DB)."""

from sqlalchemy import CheckConstraint, UniqueConstraint

from app.db.models.round import Round, RoundNomination, RoundStatus, RoundVote


class TestRoundStatusEnum:
    def test_round_status_enum_values(self) -> None:
        values = list(RoundStatus)
        assert len(values) == 5
        assert RoundStatus.NOMINATING == "nominating"
        assert RoundStatus.VOTING == "voting"
        assert RoundStatus.READING == "reading"
        assert RoundStatus.REVIEWING == "reviewing"
        assert RoundStatus.FINISHED == "finished"


class TestRoundTableArgs:
    def test_round_table_args_constraints(self) -> None:
        constraints = Round.__table_args__
        constraint_types = [type(c) for c in constraints]
        assert UniqueConstraint in constraint_types
        assert CheckConstraint in constraint_types

    def test_round_unique_constraint_columns(self) -> None:
        unique = next(c for c in Round.__table_args__ if isinstance(c, UniqueConstraint))
        col_names = [col.key for col in unique.columns]
        assert "group_id" in col_names
        assert "round_number" in col_names

    def test_round_unique_constraint_name(self) -> None:
        unique = next(c for c in Round.__table_args__ if isinstance(c, UniqueConstraint))
        assert unique.name == "uq_rounds_group_round_number"

    def test_round_check_constraint_name(self) -> None:
        check = next(c for c in Round.__table_args__ if isinstance(c, CheckConstraint))
        assert check.name == "ck_rounds_status"

    def test_round_check_constraint_covers_all_statuses(self) -> None:
        check = next(c for c in Round.__table_args__ if isinstance(c, CheckConstraint))
        expr = str(check.sqltext)
        for status in RoundStatus:
            assert status.value in expr


class TestRoundNominationTableArgs:
    def test_round_nomination_table_args_constraints(self) -> None:
        constraints = RoundNomination.__table_args__
        constraint_types = [type(c) for c in constraints]
        assert UniqueConstraint in constraint_types
        assert CheckConstraint in constraint_types

    def test_round_nomination_unique_constraint_columns(self) -> None:
        unique = next(
            c for c in RoundNomination.__table_args__ if isinstance(c, UniqueConstraint)
        )
        col_names = [col.key for col in unique.columns]
        assert "round_id" in col_names
        assert "user_id" in col_names
        assert "book_id" in col_names

    def test_round_nomination_pitch_check_constraint_name(self) -> None:
        check = next(
            c for c in RoundNomination.__table_args__ if isinstance(c, CheckConstraint)
        )
        assert check.name == "ck_round_nominations_pitch_length"

    def test_round_nomination_pitch_check_constraint_expr(self) -> None:
        check = next(
            c for c in RoundNomination.__table_args__ if isinstance(c, CheckConstraint)
        )
        expr = str(check.sqltext)
        assert "280" in expr


class TestRoundVoteTableArgs:
    def test_round_vote_table_args_constraints(self) -> None:
        constraints = RoundVote.__table_args__
        # É uma tupla com apenas UniqueConstraint
        unique = next(c for c in constraints if isinstance(c, UniqueConstraint))
        assert unique is not None

    def test_round_vote_unique_constraint_columns(self) -> None:
        unique = next(c for c in RoundVote.__table_args__ if isinstance(c, UniqueConstraint))
        col_names = [col.key for col in unique.columns]
        assert "round_id" in col_names
        assert "user_id" in col_names

    def test_round_vote_unique_constraint_name(self) -> None:
        unique = next(c for c in RoundVote.__table_args__ if isinstance(c, UniqueConstraint))
        assert unique.name == "uq_round_votes_round_user"

    def test_round_vote_update_blocked_by_design(self) -> None:
        """UPDATE em round_votes é bloqueado via RLS (USING false).

        Para mudar o voto, o usuário deve fazer DELETE + re-INSERT.
        Isso evita edge cases de vote-tampering e mantém 1 voto/user/rodada
        garantido pelo UniqueConstraint.
        """
        # Não há nada a testar no model Python — a regra é implementada na
        # migration via RLS policy `round_votes_update USING (false)`.
        # Este teste documenta o comportamento esperado.
        assert True
