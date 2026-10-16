"""Generate fixed SQLite invariants; run only before applying this migration."""

from pathlib import Path


def main() -> None:
    sql = ["-- Defense in depth for frozen evaluation records."]
    immutable = [
        "signatures",
        "evaluation_submissions",
        "result_runs",
        "result_inputs",
        "result_items",
        "chair_confirmations",
    ]
    for table in immutable:
        for op in ["UPDATE", "DELETE"]:
            sql.append(
                f"CREATE TRIGGER {table}_immutable_{op.lower()} BEFORE {op} ON {table} BEGIN SELECT RAISE(ABORT,'immutable_record'); END;"
            )
    for table in ["session_participants", "session_proposals"]:
        for op in ["INSERT", "UPDATE", "DELETE"]:
            row = "NEW" if op == "INSERT" else "OLD"
            sql.append(
                f"CREATE TRIGGER {table}_frozen_{op.lower()} BEFORE {op} ON {table} WHEN (SELECT status FROM evaluation_sessions WHERE id={row}.session_id)<>'PREPARING' BEGIN SELECT RAISE(ABORT,'session_frozen'); END;"
            )
    for op in ["UPDATE", "DELETE"]:
        sql.append(
            f"CREATE TRIGGER score_sheets_lock_{op.lower()} BEFORE {op} ON score_sheets WHEN OLD.status='SUBMITTED' BEGIN SELECT RAISE(ABORT,'submitted_sheet'); END;"
        )
    for op in ["INSERT", "UPDATE", "DELETE"]:
        row = "NEW" if op == "INSERT" else "OLD"
        sql.append(
            f"CREATE TRIGGER score_entries_lock_{op.lower()} BEFORE {op} ON score_entries WHEN (SELECT status FROM score_sheets WHERE id={row}.sheet_id)='SUBMITTED' BEGIN SELECT RAISE(ABORT,'submitted_entries'); END;"
        )
    sql.append(
        "CREATE TRIGGER score_entry_valid BEFORE UPDATE OF score,max_score_snapshot,criterion_id ON score_entries WHEN NEW.score IS NOT NULL AND (NEW.score%(SELECT score_step FROM ref_approved_criteria_items WHERE id=NEW.criterion_id)<>0 OR NEW.max_score_snapshot<>(SELECT max_score FROM ref_approved_criteria_items WHERE id=NEW.criterion_id)) BEGIN SELECT RAISE(ABORT,'invalid_score'); END;"
    )
    for table, query in [
        (
            "ref_approved_criteria_versions",
            "SELECT 1 FROM evaluation_sessions WHERE approved_criteria_version_id=OLD.id",
        ),
        (
            "ref_approved_criteria_items",
            "SELECT 1 FROM evaluation_sessions WHERE approved_criteria_version_id=OLD.approved_criteria_version_id",
        ),
        (
            "ref_proposal_uploads",
            "SELECT 1 FROM session_proposals WHERE proposal_upload_id=OLD.id",
        ),
    ]:
        sql.append(
            f"CREATE TRIGGER {table}_snapshot_frozen BEFORE UPDATE ON {table} WHEN OLD.snapshot_sha256<>NEW.snapshot_sha256 AND EXISTS({query}) BEGIN SELECT RAISE(ABORT,'frozen_snapshot_requires_new_id'); END;"
        )
    enums = {
        "evaluation_sessions": (
            "status",
            ["PREPARING", "OPEN", "ALL_SUBMITTED", "FINALIZED", "CANCELLED"],
        ),
        "attendance_records": ("status", ["CONFIRMED", "DECLINED"]),
        "score_sheets": ("status", ["DRAFT", "SUBMITTED"]),
        "signatures": ("purpose", ["EVALUATION", "CHAIR_RESULT"]),
        "result_inputs": ("exclusion", ["NONE", "LOWEST", "HIGHEST"]),
    }
    for table, (column, values) in enums.items():
        allowed = ",".join(repr(v) for v in values)
        for op in ["INSERT", "UPDATE"]:
            sql.append(
                f"CREATE TRIGGER {table}_enum_{op.lower()} BEFORE {op} ON {table} WHEN NEW.{column} NOT IN ({allowed}) BEGIN SELECT RAISE(ABORT,'invalid_status'); END;"
            )
    for table, columns in [
        ("auth_sessions", "token_hash"),
        ("score_sheets", "session_id,participant_id"),
        ("ref_committee_assignments", "project_id,login_lookup_hmac"),
        ("sync_outbox", "status,created_at"),
    ]:
        sql.append(f"CREATE INDEX {table}_lookup ON {table}({columns});")
    (
        Path(__file__).resolve().parents[1]
        / "migrations/20261016_yujin_evaluation_002.sql"
    ).write_text("\n\n".join(sql) + "\n", "utf8")


if __name__ == "__main__":
    main()
