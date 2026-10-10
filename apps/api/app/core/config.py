from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "sqlite:///./simsaimdang.db"
    simsaimdang_demo_auth: bool = False
    # 로컬 개발 외 환경 구분. preview/production에서는 데모 인증 수단을 켤 수 없다.
    app_env: Literal["local", "ci", "preview", "production"] = "local"
    # 평가위원 세션 토큰 서명 키. 비어 있으면 세션 발급이 503으로 닫힌다.
    session_secret: str = ""
    session_ttl_minutes: int = Field(default=120, ge=5, le=720)
    # 로컬 전용 본인확인 데모 코드(6자리). 비어 있으면 데모 본인확인 자체가 꺼진다.
    demo_verify_code: str = Field(default="", pattern=r"^(\d{6})?$")

    @model_validator(mode="after")
    def forbid_demo_outside_local(self):
        if self.app_env in ("preview", "production") and (
            self.simsaimdang_demo_auth or self.demo_verify_code
        ):
            raise ValueError(
                "preview/production에서는 SIMSAIMDANG_DEMO_AUTH와 "
                "DEMO_VERIFY_CODE를 켤 수 없습니다."
            )
        return self


settings = Settings()
