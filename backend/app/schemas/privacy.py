from datetime import datetime

from pydantic import BaseModel, field_validator


class DataExportResponse(BaseModel):
    message: str
    cooldown_until: datetime | None = None


class DeleteAccountRequest(BaseModel):
    confirmation: str
    current_password: str | None = None

    @field_validator("confirmation")
    @classmethod
    def validate_confirmation(cls, v: str) -> str:
        if v != "EXCLUIR":
            raise ValueError("Confirmação inválida. Digite EXCLUIR para confirmar.")
        return v
