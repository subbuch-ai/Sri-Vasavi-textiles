from typing import Any, Optional


class ERPException(Exception):
    """Base domain exception mapped to structured HTTP error responses."""

    def __init__(
        self,
        message: str,
        status_code: int = 400,
        code: str = "ERP_ERROR",
        details: Optional[Any] = None,
    ) -> None:
        self.message = message
        self.status_code = status_code
        self.code = code
        self.details = details
        super().__init__(message)


class NotFoundError(ERPException):
    def __init__(self, message: str = "Requested resource was not found.", details: Any = None) -> None:
        super().__init__(message=message, status_code=404, code="NOT_FOUND", details=details)


class PermissionDeniedError(ERPException):
    def __init__(self, message: str = "You do not have permission to perform this action.", details: Any = None) -> None:
        super().__init__(message=message, status_code=403, code="FORBIDDEN", details=details)


class AuthenticationError(ERPException):
    def __init__(self, message: str = "Invalid or expired authentication credentials.", details: Any = None) -> None:
        super().__init__(message=message, status_code=401, code="UNAUTHORIZED", details=details)


class ConflictError(ERPException):
    def __init__(self, message: str = "Operation conflicts with existing records.", details: Any = None) -> None:
        super().__init__(message=message, status_code=409, code="CONFLICT", details=details)


class ValidationError(ERPException):
    def __init__(self, message: str = "Business rule validation failed.", details: Any = None) -> None:
        super().__init__(message=message, status_code=422, code="VALIDATION_ERROR", details=details)

