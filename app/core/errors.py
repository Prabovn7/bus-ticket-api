from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class DomainError(Exception):
    """Base for errors the business rules raise. Each subclass fixes its HTTP status and code."""

    status_code: int = 400
    code: str = "domain_error"
    message: str = "Operação inválida."

    def __init__(self, message: str | None = None) -> None:
        self.message = message or self.message
        super().__init__(self.message)


class CityNotFound(DomainError):
    status_code = 404
    code = "city_not_found"
    message = "Cidade não encontrada."


class InvalidSearch(DomainError):
    status_code = 422
    code = "invalid_search"
    message = "Escolha cidades diferentes para origem e destino."


class EmailAlreadyRegistered(DomainError):
    status_code = 409
    code = "email_already_registered"
    message = "Este e-mail já está cadastrado."


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def handle_domain_error(request: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"code": exc.code, "message": exc.message},
        )
