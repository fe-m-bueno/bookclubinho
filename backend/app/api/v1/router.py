from fastapi import APIRouter

from app.api.v1.endpoints.auth import router as auth_router
from app.api.v1.endpoints.health import router as health_router

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(health_router)
api_router.include_router(auth_router, prefix="/auth")

# Routers will be registered here as features are implemented:
# from app.api.v1.endpoints import users, groups, rounds, chat
# api_router.include_router(users.router, prefix="/users", tags=["users"])
