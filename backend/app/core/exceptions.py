"""Base exception for service-layer errors."""


class ServiceError(Exception):
    """Base for all service errors. Carries an HTTP status_code."""

    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code
