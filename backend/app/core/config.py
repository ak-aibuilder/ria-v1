from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_ENV: str = "development"
    PORT: int = 8000
    MONGODB_URI: str
    MONGODB_DB: str = "ria"
    JWT_SECRET: str = "change-me-in-production"
    JWT_EXPIRES_IN: int = 1800
    CORS_ORIGINS: str = "http://localhost:3000"
    ANTHROPIC_API_KEY: str = ""
    CLAUDE_MODEL: str = "claude-sonnet-4-6"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
