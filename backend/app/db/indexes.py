from app.core.config import get_settings
from app.db.mongo import get_db


async def ensure_indexes() -> None:
    db = get_db()
    await db.users.create_index("email", unique=True)
    await db.sessions.create_index(
        "last_activity",
        expireAfterSeconds=get_settings().JWT_EXPIRES_IN,
    )
