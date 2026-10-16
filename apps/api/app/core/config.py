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
    # 로컬 시연용 관리자 계정(modules/auth). SIMSAIMDANG_DEMO_AUTH=true일 때만 로그인이 열리고,
    # 그 플래그는 preview/production에서 켤 수 없으므로 배포 환경에서는 자동으로 닫힌다.
    local_admin_id: str = "admin"
    local_admin_password: str = "admin"
    # 제안요청서 파싱 결과 저장소(DaeUng79 documents 모듈의 SQLite). 비우면
    # apps/documents_daeung/documents.sqlite3. 읽기 전용으로만 연다(modules/ai/rfp_criteria).
    documents_db_path: str = ""
    # 평가위원 본인확인은 등록된 생년월일 대조다(evaluator_access). 관리자용 로컬 마스터 번호는
    # 설정이 아니라 APP_ENV=local 여부로만 켜진다.

    @model_validator(mode="after")
    def forbid_demo_outside_local(self):
        if self.app_env in ("preview", "production") and self.simsaimdang_demo_auth:
            raise ValueError("preview/production에서는 SIMSAIMDANG_DEMO_AUTH를 켤 수 없습니다.")
        return self


settings = Settings()
