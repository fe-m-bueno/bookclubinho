"""Pydantic schemas for onboarding endpoints."""

from __future__ import annotations

import re

from pydantic import BaseModel, field_validator

VALID_GENRE_SLUGS: list[str] = [
    "fantasy",
    "sci-fi",
    "romance",
    "mystery",
    "thriller",
    "horror",
    "literary-fiction",
    "historical-fiction",
    "contemporary-fiction",
    "dystopian",
    "young-adult",
    "memoir",
    "biography",
    "self-help",
    "psychology",
    "philosophy",
    "science",
    "history",
    "true-crime",
    "poetry",
    "graphic-novel",
    "manga",
    "business",
    "technology",
    "essays",
]

USERNAME_REGEX = re.compile(r"^[a-zA-Z][a-zA-Z0-9_]{2,19}$")


class UsernameCheckResponse(BaseModel):
    available: bool


class PreferencesRequest(BaseModel):
    preferred_genres: list[str]

    @field_validator("preferred_genres")
    @classmethod
    def validate_genres(cls, v: list[str]) -> list[str]:
        # Deduplica preservando ordem
        seen: set[str] = set()
        deduped: list[str] = []
        for slug in v:
            if slug not in seen:
                seen.add(slug)
                deduped.append(slug)

        if len(deduped) < 1:
            raise ValueError("Selecione pelo menos 1 gênero.")
        if len(deduped) > 10:
            raise ValueError("Selecione no máximo 10 gêneros.")

        invalid = [s for s in deduped if s not in VALID_GENRE_SLUGS]
        if invalid:
            raise ValueError(f"Gêneros inválidos: {', '.join(invalid)}")

        return deduped


class OnboardingProfileResponse(BaseModel):
    message: str


class PreferencesResponse(BaseModel):
    message: str


class OnboardingCompleteResponse(BaseModel):
    message: str
