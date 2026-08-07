"""Garante que todo model declarado em app/db/models entra no Base.metadata.

O `target_metadata` do Alembic (alembic/env.py) vem de `import app.db.models`.
Um model cujo módulo não é importado no `__init__` fica fora do metadata, e o
próximo autogenerate emite um `drop_table` na tabela dele. Este teste falha
antes disso chegar numa migration.
"""

import pkgutil

import app.db.models
from app.db.engine import Base

# Módulos de app/db/models que não declaram tabelas.
_NON_TABLE_MODULES = {"base"}

# Tabelas visíveis no metadata considerando apenas `import app.db.models` — a
# mesma superfície que o Alembic enxerga. Capturado no import do módulo de teste
# para não contar imports feitos por outros testes.
_TABLES_FROM_PACKAGE = frozenset(Base.metadata.tables)


def _model_modules() -> list[str]:
    return [name for _, name, _ in pkgutil.iter_modules(app.db.models.__path__) if name not in _NON_TABLE_MODULES]


class TestModelMetadataRegistry:
    def test_every_model_module_is_imported_by_package_init(self) -> None:
        """Cada módulo de model precisa ser importado por app.db.models."""
        missing = [name for name in _model_modules() if not hasattr(app.db.models, name)]
        assert missing == [], (
            "Módulos de model fora de app/db/models/__init__.py: "
            f"{missing}. Sem o import, a tabela não entra no Base.metadata e o "
            "próximo autogenerate do Alembic emite um drop_table nela."
        )

    def test_every_model_class_is_exported(self) -> None:
        """Todo model mapeado precisa estar no __all__ do pacote."""
        mapped = {
            mapper.class_.__name__
            for mapper in Base.registry.mappers
            if mapper.class_.__module__.startswith("app.db.models.")
        }
        missing = sorted(mapped - set(app.db.models.__all__))
        assert missing == [], f"Models mapeados fora de app.db.models.__all__: {missing}"

    def test_message_reports_is_registered(self) -> None:
        """Regressão: message_reports saía do metadata (issue #259)."""
        assert "message_reports" in _TABLES_FROM_PACKAGE
        assert hasattr(app.db.models, "MessageReport")
