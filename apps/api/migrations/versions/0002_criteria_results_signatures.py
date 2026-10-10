"""평가기준 확정 기록, 결과 확정 기록, 평가표 서명·기준 버전 열.

Revision 0002 (u-jing). 0001은 수정하지 않는다. 공동 DB 적용은 DaeUng79와 순서를 정한 뒤 수행한다.
"""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "criteria_confirmations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("criteria", sa.JSON, nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("confirmed_by", sa.String(100), nullable=False),
        sa.Column("confirmed_at", sa.String(40), nullable=False),
        sa.Column("source_document_id", sa.String(100), nullable=True),
        sa.Column("source_revision", sa.String(100), nullable=True),
        sa.Column("review_reason", sa.String(500), nullable=True),
        sa.UniqueConstraint("project_id", "version", name="uq_criteria_version"),
    )
    op.create_table(
        "result_confirmations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("policy_version", sa.String(40), nullable=False),
        sa.Column("criteria_version", sa.Integer, nullable=False),
        sa.Column("result_sha256", sa.String(64), nullable=False),
        sa.Column("result_snapshot", sa.JSON, nullable=False),
        sa.Column("expected", sa.Integer, nullable=False),
        sa.Column("submitted", sa.Integer, nullable=False),
        sa.Column("confirmed_by", sa.String(100), nullable=False),
        sa.Column("confirmed_at", sa.String(40), nullable=False),
        sa.Column("closed_by", sa.String(100), nullable=True),
        sa.Column("closed_at", sa.String(40), nullable=True),
        sa.UniqueConstraint("project_id"),
    )
    with op.batch_alter_table("evaluation_sheets") as batch:
        batch.add_column(sa.Column("criteria_version", sa.Integer, nullable=True))
        batch.add_column(sa.Column("signed_at", sa.String(40), nullable=True))
        batch.add_column(sa.Column("sheet_hash", sa.String(64), nullable=True))
        batch.add_column(sa.Column("sign_method", sa.String(40), nullable=True))


def downgrade():
    with op.batch_alter_table("evaluation_sheets") as batch:
        batch.drop_column("sign_method")
        batch.drop_column("sheet_hash")
        batch.drop_column("signed_at")
        batch.drop_column("criteria_version")
    op.drop_table("result_confirmations")
    op.drop_table("criteria_confirmations")
