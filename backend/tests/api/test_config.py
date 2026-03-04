"""Testes para os endpoints de configuração pública."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.endpoints.config import router
from app.core.genres_config import GENRES

EXPECTED_SLUGS = {
    "ficcao",
    "nao-ficcao",
    "fantasia",
    "sci-fi",
    "romance",
    "terror",
    "misterio-thriller",
    "biografia",
    "autoajuda",
    "poesia",
    "hq-manga",
    "classicos",
    "jovem-adulto",
    "historia",
    "filosofia",
    "true-crime",
    "humor",
    "drama",
    "distopia",
    "aventura",
}

GENRE_FIELDS = {"slug", "display_name", "emoji", "description"}


@pytest.fixture(scope="module")
def client() -> TestClient:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    return TestClient(app)


class TestListGenres:
    def test_status_200(self, client: TestClient) -> None:
        response = client.get("/api/v1/config/genres")
        assert response.status_code == 200

    def test_returns_20_genres(self, client: TestClient) -> None:
        response = client.get("/api/v1/config/genres")
        data = response.json()
        assert "genres" in data
        assert len(data["genres"]) == 20

    def test_genre_fields_present(self, client: TestClient) -> None:
        response = client.get("/api/v1/config/genres")
        for genre in response.json()["genres"]:
            assert GENRE_FIELDS == set(genre.keys()), (
                f"Gênero {genre.get('slug')} com campos inesperados: {set(genre.keys())}"
            )

    def test_all_expected_slugs_present(self, client: TestClient) -> None:
        response = client.get("/api/v1/config/genres")
        slugs = {g["slug"] for g in response.json()["genres"]}
        assert slugs == EXPECTED_SLUGS

    def test_cache_control_header(self, client: TestClient) -> None:
        response = client.get("/api/v1/config/genres")
        cache_control = response.headers.get("cache-control", "")
        assert "public" in cache_control
        assert "max-age=86400" in cache_control

    def test_genres_non_empty_strings(self, client: TestClient) -> None:
        response = client.get("/api/v1/config/genres")
        for genre in response.json()["genres"]:
            for field in GENRE_FIELDS:
                assert isinstance(genre[field], str) and genre[field].strip(), (
                    f"Campo '{field}' vazio no gênero '{genre.get('slug')}'"
                )


class TestGenresConfig:
    def test_genres_singleton_loaded(self) -> None:
        assert isinstance(GENRES, list)
        assert len(GENRES) == 20

    def test_all_slugs_unique(self) -> None:
        slugs = [g.slug for g in GENRES]
        assert len(slugs) == len(set(slugs)), "Slugs duplicados encontrados"

    def test_genre_fields_not_empty(self) -> None:
        for genre in GENRES:
            assert genre.slug.strip()
            assert genre.display_name.strip()
            assert genre.emoji.strip()
            assert genre.description.strip()
