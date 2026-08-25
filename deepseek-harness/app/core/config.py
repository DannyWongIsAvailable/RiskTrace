from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """
    RiskTrace DeepSeek Harness 服务统一配置。
    """

    # ---------------- FastAPI ----------------

    app_name: str = "RiskTrace DeepSeek Harness Service"
    app_version: str = "0.2.0"

    # ---------------- DeepSeek Harness ----------------

    harness_provider: str = "deepseek-official"
    harness_model: str = "deepseek-v4-flash"

    harness_cordis: str | None = Field(
      default=None,
      alias="HARNESS_CORDIS"
    )

    dsh_home: Path = Field(
        default=BASE_DIR / ".dsh",
        alias="DSH_HOME",
    )

    harness_workspace: Path = Field(
        default=BASE_DIR / "workspace",
        alias="HARNESS_WORKSPACE",
    )

    harness_session_root: Path = Field(
        default=BASE_DIR / "sessions",
        alias="HARNESS_SESSION_ROOT",
    )

    harness_max_concurrency: int = Field(
        default=1,
        alias="HARNESS_MAX_CONCURRENCY",
        ge=1,
    )

    harness_run_db: Path = Field(
        default=BASE_DIR / "data" / "runs.sqlite3",
        alias="HARNESS_RUN_DB",
    )

    harness_stale_run_seconds: int = Field(
        default=900,
        alias="HARNESS_STALE_RUN_SECONDS",
        ge=60,
    )

    harness_result_retention_hours: int = Field(
        default=72,
        alias="HARNESS_RESULT_RETENTION_HOURS",
        ge=1,
    )

    # ---------------- DeepSeek API ----------------

    deepseek_api_key: SecretStr | None = Field(
        default=None,
        alias="DEEPSEEK_API_KEY",
    )

    deepseek_base_url: str | None = Field(
        default=None,
        alias="DEEPSEEK_BASE_URL",
    )

    # ---------------- MinerU gateway ----------------

    mineru_gateway_url: str = Field(
        default="http://127.0.0.1:18000",
        alias="MINERU_GATEWAY_URL",
    )

    # ---------------- RiskTrace API auth ----------------

    harness_api_key: SecretStr | None = Field(
        default=None,
        alias="HARNESS_API_KEY",
    )

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    def ensure_directories(self) -> None:
        """
        确保运行所需目录存在。
        """
        self.dsh_home.mkdir(parents=True, exist_ok=True)
        self.harness_workspace.mkdir(parents=True, exist_ok=True)
        self.harness_session_root.mkdir(parents=True, exist_ok=True)
        self.harness_run_db.parent.mkdir(parents=True, exist_ok=True)


settings = Settings()
