"""Schemas para upload de mídia do chat."""

from pydantic import BaseModel


class MediaUploadResponse(BaseModel):
    """Resposta do upload.

    `media_key`/`thumbnail_key` são o que o cliente devolve ao criar a mensagem —
    é a chave que o backend persiste. As URLs vão junto só para preview imediato:
    são presigned e expiram em uma hora, então não devem ser guardadas.
    """

    media_key: str
    thumbnail_key: str
    media_url: str
    thumbnail_url: str
    width: int
    height: int
