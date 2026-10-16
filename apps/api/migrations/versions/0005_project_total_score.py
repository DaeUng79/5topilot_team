"""사업별 기술평가 총배점.

Revision 0005 (u-jing). projects(0001)에 technical_total_score INTEGER NULL을 추가한다. NULL이면
기본 100점으로 본다(projects/models.DEFAULT_TOTAL_SCORE). 기존 행(demo-project 포함)은 NULL로 두고
바꾸지 않는다. 0001~0004는 수정하지 않는다. 공동 DB 적용은 DaeUng79와 순서를 정한 뒤 수행한다.
"""

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("projects") as batch:
        batch.add_column(sa.Column("technical_total_score", sa.Integer(), nullable=True))


def downgrade():
    with op.batch_alter_table("projects") as batch:
        batch.drop_column("technical_total_score")
