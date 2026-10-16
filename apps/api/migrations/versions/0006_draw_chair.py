"""추첨 결과에 평가위원장 지정 열.

Revision 0006 (u-jing). committee_draws(0001, Lex6won)에 chair_id VARCHAR(36) NULL(현재 위원장,
selected_ids 중 1명)과 chair_history JSON NULL(지정·변경 이력 목록)을 추가한다. 기존 행은
NULL(미지정)이다. 0001~0005는 수정하지 않는다. 공동 DB 적용은 DaeUng79·Lex6won과 순서를 정한 뒤
수행한다.
"""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("committee_draws") as batch:
        batch.add_column(sa.Column("chair_id", sa.String(36), nullable=True))
        batch.add_column(sa.Column("chair_history", sa.JSON(), nullable=True))


def downgrade():
    with op.batch_alter_table("committee_draws") as batch:
        batch.drop_column("chair_history")
        batch.drop_column("chair_id")
