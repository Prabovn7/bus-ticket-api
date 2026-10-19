from fastapi import FastAPI

from app.catalog.router import router as catalog_router
from app.core.errors import register_exception_handlers


def create_app() -> FastAPI:
    app = FastAPI(title="bus-ticket-api")
    register_exception_handlers(app)
    app.include_router(catalog_router)

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
