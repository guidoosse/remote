from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Day Tracker"
    mongo_uri: str = "mongodb://127.0.0.1:27017"
    mongo_db: str = "calisthenics_tracker"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
