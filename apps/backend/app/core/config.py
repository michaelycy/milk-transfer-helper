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

    # AI 供应商密钥（FR-K1）：只存环境变量，永不落库、不下发、不进日志
    # 内置供应商密钥（环境变量兜底路径）：默认空字符串占位——未配置时应用照常启动，
    # 场景调用走降级文案（FR-K1）。界面设置的密钥经加密落库（FR-K6/NFR-2），
    # 解析优先级：数据库密文 > 本环境变量
    ai_zhipu_api_key: str = ""
    ai_deepseek_api_key: str = ""
    ai_openai_api_key: str = ""
    # 界面密钥的加密主密钥（AES-256-GCM 派生源）：仅存环境变量；未配置时界面密钥功能停用
    ai_key_master_secret: str = ""
    # 供应商默认端点（OpenAI 兼容协议）；解析链 = 场景 base_url > 注册表 > 此处内置默认
    ai_zhipu_base_url: str = "https://open.bigmodel.cn/api/paas/v4"
    ai_deepseek_base_url: str = "https://api.deepseek.com/v1"
    ai_openai_base_url: str = "https://api.openai.com/v1"
    # 模型调用超时（秒），FR-K1 验收：用户侧等待 ≤ 20s
    ai_timeout_seconds: float = 15.0
    # 场景配置缓存秒数（配置热更新延迟的上限）
    ai_config_cache_seconds: float = 60.0

    # 匿名→微信迁移时同步 user_id 的业务表（与 wechat-login Edge Function 保持一致）
    migrate_tables: list[str] = [
        "feed_records",
        "symptom_logs",
        "transfer_plans",
        "alerts",
        "favorites",
        "weight_logs",
        "babies",
        "baby_members",
        "family_invites",
    ]

    # API 运行日志（FR-J12，规范见 docs/spec/05-api-guidelines.md §4）
    api_log_enabled: bool = True
    # 保留天数：超期由启动与周期任务清理
    api_log_retention_days: int = 30


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
