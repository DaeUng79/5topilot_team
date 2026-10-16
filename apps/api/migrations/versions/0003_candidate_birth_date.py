"""평가위원 본인확인용 생년월일 열.

Revision 0003 (u-jing). committee_candidates(0001, Lex6won)에 birth_date VARCHAR(8) NULL을 추가한다.
YYYYMMDD로 정규화해 저장하며 기존 행은 NULL(미등록)이다. 0001·0002는 수정하지 않는다.
공동 DB 적용은 DaeUng79·Lex6won과 순서를 정한 뒤 수행한다.
"""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("committee_candidates") as batch:
        batch.add_column(sa.Column("birth_date", sa.String(8), nullable=True))


def downgrade():
    with op.batch_alter_table("committee_candidates") as batch:
        batch.drop_column("birth_date")
