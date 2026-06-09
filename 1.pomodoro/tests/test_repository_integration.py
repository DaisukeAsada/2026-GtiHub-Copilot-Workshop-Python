from datetime import datetime

from repositories.sqlite_repository import SQLiteRepository
from services.stats_service import StatsService


def test_settings_persist_across_repository_instances(tmp_path):
    db_path = tmp_path / "pomodoro.db"

    repo_first = SQLiteRepository(str(db_path))
    updated = repo_first.update_settings(
        {
            "work_minutes": 40,
            "short_break_minutes": 7,
            "long_break_minutes": 25,
            "long_break_interval": 6,
        }
    )

    repo_second = SQLiteRepository(str(db_path))
    loaded = repo_second.get_settings()

    assert updated == loaded


def test_stats_service_handles_date_boundary(tmp_path):
    db_path = tmp_path / "pomodoro.db"
    repository = SQLiteRepository(str(db_path))
    stats_service = StatsService(repository)

    repository.create_session(
        "work",
        1500,
        created_at=datetime(2026, 6, 9, 23, 59, 50),
    )
    repository.create_session(
        "short_break",
        300,
        created_at=datetime(2026, 6, 9, 23, 59, 55),
    )
    repository.create_session(
        "work",
        1200,
        created_at=datetime(2026, 6, 10, 0, 0, 10),
    )

    stats_day_1 = stats_service.get_today_stats(now=datetime(2026, 6, 9, 23, 59, 59))
    stats_day_2 = stats_service.get_today_stats(now=datetime(2026, 6, 10, 0, 0, 30))

    assert stats_day_1 == {
        "completed_work_count": 1,
        "focus_seconds": 1500,
    }
    assert stats_day_2 == {
        "completed_work_count": 1,
        "focus_seconds": 1200,
    }
