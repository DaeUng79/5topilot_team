from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "sqlite:///./simsaimdang.db"
    simsaimdang_demo_auth: bool = False


settings = Settings()
