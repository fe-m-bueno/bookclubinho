from fastapi import APIRouter

from app.api.v1.endpoints.auth import router as auth_router
from app.api.v1.endpoints.books import router as books_router
from app.api.v1.endpoints.config import router as config_router
from app.api.v1.endpoints.groups import router as groups_router
from app.api.v1.endpoints.health import router as health_router
from app.api.v1.endpoints.onboarding import router as onboarding_router
from app.api.v1.endpoints.rounds import group_rounds_router, rounds_router
from app.api.v1.endpoints.users import router as users_router

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(health_router)
api_router.include_router(config_router)
api_router.include_router(auth_router, prefix="/auth")
api_router.include_router(books_router, prefix="/books", tags=["books"])
api_router.include_router(groups_router, prefix="/groups", tags=["groups"])
api_router.include_router(
    group_rounds_router, prefix="/groups/{group_id}/rounds", tags=["rounds"]
)
api_router.include_router(rounds_router, prefix="/rounds", tags=["rounds"])
api_router.include_router(onboarding_router, prefix="/onboarding", tags=["onboarding"])
api_router.include_router(users_router, prefix="/users", tags=["users"])
