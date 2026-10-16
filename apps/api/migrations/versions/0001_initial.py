"""Initial project / committee / evaluation schema. Never edit after merge."""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "projects",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("department", sa.String(100), nullable=False),
        sa.Column("criteria", sa.JSON, nullable=False),
        sa.Column("vendor_ids", sa.JSON, nullable=False),
    )
    op.create_table(
        "committee_candidates",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("organization", sa.String(200), nullable=False),
        sa.Column("specialty", sa.String(100), nullable=False),
        sa.Column("active", sa.Boolean, nullable=False),
    )
    op.create_table(
        "committee_draws",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("candidate_snapshot", sa.JSON, nullable=False),
        sa.Column("selected_ids", sa.JSON, nullable=False),
        sa.Column("reserve_ids", sa.JSON, nullable=False),
        sa.Column("snapshot_sha256", sa.String(64), nullable=False),
        sa.Column("method", sa.String(80), nullable=False),
        sa.Column("actor_id", sa.String(100), nullable=False),
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.UniqueConstraint("project_id"),
    )
    op.create_table(
        "evaluation_sheets",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column(
            "evaluator_id", sa.String(36), sa.ForeignKey("committee_candidates.id"), nullable=False
        ),
        sa.Column("scores", sa.JSON, nullable=False),
        sa.Column("opinion", sa.String(4000), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("submitted_at", sa.String(40), nullable=True),
        sa.UniqueConstraint("project_id", "evaluator_id", name="uq_sheet_member"),
    )


def downgrade():
    op.drop_table("evaluation_sheets")
    op.drop_table("committee_draws")
    op.drop_table("committee_candidates")
    op.drop_table("projects")
