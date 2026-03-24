from fastapi import APIRouter

from app.api.v1.endpoints.auth import router as auth_router
from app.api.v1.endpoints.badges import (
    badges_catalog_router,
    badges_group_router,
    badges_user_router,
)
from app.api.v1.endpoints.books import router as books_router
from app.api.v1.endpoints.chat_stream import router as chat_stream_router
from app.api.v1.endpoints.config import router as config_router
from app.api.v1.endpoints.groups import router as groups_router
from app.api.v1.endpoints.health import router as health_router
from app.api.v1.endpoints.integrations import router as integrations_router
from app.api.v1.endpoints.link_preview import router as link_preview_router
from app.api.v1.endpoints.media import router as media_router
from app.api.v1.endpoints.meetings import (
    group_meetings_router as group_meetings_router,
)
from app.api.v1.endpoints.meetings import (
    meetings_router as meetings_standalone_router,
)
from app.api.v1.endpoints.messages import group_messages_router, messages_router
from app.api.v1.endpoints.onboarding import router as onboarding_router
from app.api.v1.endpoints.quotes import quotes_group_router, quotes_router
from app.api.v1.endpoints.reading_sessions import router as reading_sessions_router
from app.api.v1.endpoints.reviews import reviews_router
from app.api.v1.endpoints.rounds import group_rounds_router, rounds_router
from app.api.v1.endpoints.shelf import shelf_group_router, shelf_public_router
from app.api.v1.endpoints.stats import stats_group_router, stats_user_router
from app.api.v1.endpoints.users import router as users_router
from app.api.v1.endpoints.wrapped import wrapped_group_router

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
api_router.include_router(reviews_router, prefix="/rounds", tags=["reviews"])
api_router.include_router(
    group_messages_router, prefix="/groups/{group_id}/messages", tags=["chat"]
)
api_router.include_router(messages_router, prefix="/messages", tags=["chat"])
api_router.include_router(
    group_meetings_router,
    prefix="/groups/{group_id}/meetings",
    tags=["meetings"],
)
api_router.include_router(
    meetings_standalone_router, prefix="/meetings", tags=["meetings"]
)
api_router.include_router(
    reading_sessions_router,
    prefix="/reading-sessions",
    tags=["reading-sessions"],
)
api_router.include_router(onboarding_router, prefix="/onboarding", tags=["onboarding"])
api_router.include_router(users_router, prefix="/users", tags=["users"])
api_router.include_router(stats_user_router, prefix="/users", tags=["stats"])
api_router.include_router(badges_user_router, prefix="/users", tags=["badges"])
api_router.include_router(
    media_router, prefix="/groups/{group_id}/media/upload", tags=["media"]
)
api_router.include_router(
    chat_stream_router, prefix="/groups/{group_id}/chat/stream", tags=["chat-stream"]
)
api_router.include_router(
    stats_group_router, prefix="/groups/{group_id}/stats", tags=["stats"]
)
api_router.include_router(
    badges_group_router, prefix="/groups/{group_id}/badges", tags=["badges"]
)
api_router.include_router(
    quotes_group_router, prefix="/groups/{group_id}/quotes", tags=["quotes"]
)
api_router.include_router(
    shelf_group_router, prefix="/groups/{group_id}/shelf", tags=["shelf"]
)
api_router.include_router(badges_catalog_router, prefix="/badges", tags=["badges"])
api_router.include_router(quotes_router, prefix="/quotes", tags=["quotes"])
api_router.include_router(shelf_public_router, prefix="/shelf", tags=["shelf"])
api_router.include_router(
    wrapped_group_router, prefix="/groups/{group_id}/wrapped", tags=["wrapped"]
)
api_router.include_router(
    integrations_router, prefix="/integrations", tags=["integrations"]
)
api_router.include_router(link_preview_router)
