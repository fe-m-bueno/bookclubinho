"""Shared constants used across auth, session, and account services."""

# Redis key prefix for blacklisted refresh token JTIs
TOKEN_BLACKLIST_PREFIX = "token_blacklist:"

# TTL for blacklisted JTIs — must cover the max refresh token lifetime (7 days)
REFRESH_TOKEN_BLACKLIST_TTL = 604_800  # seconds
