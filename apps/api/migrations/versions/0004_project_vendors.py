"""사업별 평가 대상 업체 표시명.

Revision 0004 (u-jing). projects(0001)에 vendors JSON NULL을 추가한다. [{"id", "name"}] 목록이며
NULL이면 vendor_ids에서 시작용 이름(A사·B사·C사)을 만든다. 기존 행(demo-project 포함)은 NULL로
두고 바꾸지 않는다. 0001~0003은 수정하지 않는다. 공동 DB 적용은 DaeUng79와 순서를 정한 뒤 수행한다.
"""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("projects") as batch:
        batch.add_column(sa.Column("vendors", sa.JSON(), nullable=True))


def downgrade():
    with op.batch_alter_table("projects") as batch:
        batch.drop_column("vendors")
