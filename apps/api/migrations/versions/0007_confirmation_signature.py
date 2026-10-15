"""결과 확정 기록에 평가위원장 자필 서명.

Revision 0007 (u-jing). result_confirmations(0002, u-jing)에 signature_image TEXT NULL(PNG data
URL), signature_sha256 VARCHAR(64) NULL(이미지 바이트 해시), sign_method VARCHAR(40) NULL
(chair-handwritten-v1), signer_name VARCHAR(100) NULL(서명 시점 위원장 이름)을 추가한다. 서명 시각은
confirmed_at, 대상 결과 버전·해시는 criteria_version·policy_version·result_sha256을 그대로 쓴다.
0007 이전 확정 행은 NULL(서명 이미지 없음)로 남긴다. 법적 전자서명이 아니며 로컬 시연용이다.
0001~0006은 수정하지 않는다. 공동 DB 적용은 DaeUng79와 순서를 정한 뒤 수행한다.
"""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("result_confirmations") as batch:
        batch.add_column(sa.Column("signature_image", sa.Text(), nullable=True))
        batch.add_column(sa.Column("signature_sha256", sa.String(64), nullable=True))
        batch.add_column(sa.Column("sign_method", sa.String(40), nullable=True))
        batch.add_column(sa.Column("signer_name", sa.String(100), nullable=True))


def downgrade():
    with op.batch_alter_table("result_confirmations") as batch:
        batch.drop_column("signer_name")
        batch.drop_column("sign_method")
        batch.drop_column("signature_sha256")
        batch.drop_column("signature_image")
