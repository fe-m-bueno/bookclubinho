"""Carrega e valida a lista de gêneros literários do arquivo YAML de configuração."""

from __future__ import annotations

from pathlib import Path

import yaml
from pydantic import BaseModel


class Genre(BaseModel):
    slug: str
    display_name: str
    emoji: str
    description: str


def _load_genres() -> list[Genre]:
    path = Path(__file__).parent.parent.parent / "config" / "genres.yml"
    if not path.exists():
        raise RuntimeError(
            f"Arquivo de gêneros não encontrado: {path}. "
            "Certifique-se de que config/genres.yml existe no diretório do backend."
        )
    with path.open(encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return [Genre(**g) for g in data["genres"]]


GENRES: list[Genre] = _load_genres()
