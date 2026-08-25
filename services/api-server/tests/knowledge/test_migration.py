from pathlib import Path

from schoolworkhub.knowledge.models import KnowledgeDocument

EXPECTED_PERMISSION_CODES = {
    "knowledge.read",
    "knowledge.create",
    "knowledge.edit.own",
    "knowledge.edit.assigned",
    "knowledge.publish",
    "knowledge.approve",
    "knowledge.delete",
    "knowledge.restore",
    "knowledge.history.read",
    "knowledge.history.restore",
    "knowledge.manage.shared_files",
}


def test_migration_declares_all_permission_seeds() -> None:
    migration = (
        Path(__file__).parents[2]
        / "alembic"
        / "versions"
        / "0003_knowledge_documents.py"
    ).read_text(encoding="utf-8")
    for code in EXPECTED_PERMISSION_CODES:
        assert code in migration


def test_document_model_declares_required_query_indexes() -> None:
    index_names = {index.name for index in KnowledgeDocument.__table__.indexes}
    assert "ix_knowledge_documents_school_status_updated" in index_names
    assert "ix_knowledge_documents_school_author" in index_names


def test_migration_supports_upgrade_and_downgrade() -> None:
    migration = (
        Path(__file__).parents[2]
        / "alembic"
        / "versions"
        / "0003_knowledge_documents.py"
    ).read_text(encoding="utf-8")
    assert "def upgrade() -> None:" in migration
    assert "def downgrade() -> None:" in migration
    assert "DROP INDEX IF EXISTS ix_knowledge_documents_search_vector" in migration
