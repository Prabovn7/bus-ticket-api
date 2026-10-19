from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class DomainError(Exception):
    """Base for errors the business rules raise. Each subclass fixes its HTTP status and code."""

    status_code: int = 400
    code: str = "domain_error"
    message: str = "Operação inválida."
    headers: dict[str, str] | None = None

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


class Unauthorized(DomainError):
    status_code = 401
    headers = {"WWW-Authenticate": "Bearer"}


class InvalidCredentials(Unauthorized):
    code = "invalid_credentials"
    message = "E-mail ou senha incorretos."


class NotAuthenticated(Unauthorized):
    code = "not_authenticated"
    message = "Credenciais ausentes, inválidas ou expiradas."


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def handle_domain_error(request: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"code": exc.code, "message": exc.message},
            headers=exc.headers,
        )
