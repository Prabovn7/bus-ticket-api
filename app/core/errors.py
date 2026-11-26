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


class TripNotFound(DomainError):
    status_code = 404
    code = "trip_not_found"
    message = "Viagem não encontrada."


class InvalidSeat(DomainError):
    status_code = 422
    code = "invalid_seat"
    message = "Este assento não existe nesta viagem."


class SeatUnavailable(DomainError):
    status_code = 409
    code = "seat_unavailable"
    message = "Este assento não está mais disponível."


class ReservationNotFound(DomainError):
    status_code = 404
    code = "reservation_not_found"
    message = "Reserva não encontrada."


class ReservationNotPayable(DomainError):
    status_code = 409
    code = "reservation_not_payable"
    message = "Esta reserva não pode mais ser paga."


class HoldExpired(DomainError):
    status_code = 410
    code = "hold_expired"
    message = "O tempo da reserva acabou. Escolha o assento novamente."


class IdempotencyConflict(DomainError):
    status_code = 422
    code = "idempotency_key_reused"
    message = "Esta Idempotency-Key já foi usada com outro pedido."


class RequestInProgress(DomainError):
    status_code = 409
    code = "request_in_progress"
    message = "Este pedido ainda está sendo processado."


class ReservationNotCancellable(DomainError):
    status_code = 409
    code = "reservation_not_cancellable"
    message = "Esta reserva não pode mais ser cancelada."


class TripAlreadyDeparted(DomainError):
    status_code = 409
    code = "trip_already_departed"
    message = "A viagem já partiu."


class PaymentInProgress(DomainError):
    status_code = 409
    code = "payment_in_progress"
    message = "Há um pagamento em análise. Tente de novo quando ele for resolvido."


class PaymentAlreadyResolved(DomainError):
    status_code = 409
    code = "payment_already_resolved"
    message = "Este pagamento já foi resolvido. Consulte a reserva para ver o resultado."


class SeatLost(DomainError):
    status_code = 409
    code = "seat_lost"
    message = "O assento deixou de ser seu antes da confirmação. O valor será estornado."


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
