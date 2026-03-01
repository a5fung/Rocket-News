from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    finnhub_api_key: str = ""
    polygon_api_key: str = ""
    reddit_user_agent: str = "RocketNews/0.1"
    x_bearer_token: str = ""
    anthropic_api_key: str = ""
    cors_origins: str = "http://localhost:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]


settings = Settings()
