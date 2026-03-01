from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    finnhub_api_key: str = ""
    polygon_api_key: str = ""
    reddit_user_agent: str = "RocketNews/0.1"
    x_bearer_token: str = ""
    anthropic_api_key: str = ""
    cors_origins: str = "http://localhost:3000"
    # Alpaca paper-trading account — gives free Benzinga news feed
    alpaca_api_key: str = ""
    alpaca_api_secret: str = ""
    # Financial Modeling Prep — free tier (250 req/day), good SEC filing coverage
    fmp_api_key: str = ""
    # Telegram Scout alerts
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    alert_symbols: str = ""       # fallback comma-separated list; frontend syncs at runtime
    alert_price_pct: float = 5.0  # alert when |change%| >= this value

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]


settings = Settings()
