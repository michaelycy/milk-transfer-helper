"""应用配置：全部来自环境变量，密钥不进代码。"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str

    wechat_appid: str = ""
    wechat_secret: str = ""

    # 匿名→微信迁移时同步 user_id 的业务表（与 wechat-login Edge Function 保持一致）
    migrate_tables: list[str] = [
        "feed_records",
        "symptom_logs",
        "transfer_plans",
        "alerts",
        "favorites",
        "weight_logs",
        "babies",
    ]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
