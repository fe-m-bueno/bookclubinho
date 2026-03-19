"""Schemas para upload de mídia do chat."""

from pydantic import BaseModel


class MediaUploadResponse(BaseModel):
    media_url: str
    thumbnail_url: str
    width: int
    height: int
