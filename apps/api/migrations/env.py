from alembic import context

from app.core.db import Base, engine
from app.modules.committee import models as committee_models  # noqa: F401
from app.modules.evaluations import models as evaluation_models  # noqa: F401
from app.modules.projects import criteria as criteria_models  # noqa: F401
from app.modules.projects import models as project_models  # noqa: F401
from app.modules.results import models as result_models  # noqa: F401

with engine.connect() as connection:
    context.configure(connection=connection, target_metadata=Base.metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()
