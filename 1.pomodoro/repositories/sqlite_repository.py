import sqlite3
from datetime import datetime
from pathlib import Path


class SQLiteRepository:
    def __init__(self, db_path: str):
        self.db_path = db_path
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self.ensure_schema()

    def _connect(self):
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        return connection

    def ensure_schema(self):
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS settings (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    work_minutes INTEGER NOT NULL,
                    short_break_minutes INTEGER NOT NULL,
                    long_break_minutes INTEGER NOT NULL,
                    long_break_interval INTEGER NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_type TEXT NOT NULL,
                    duration_sec INTEGER NOT NULL,
                    created_at TEXT NOT NULL
                )
                """
            )

            default_row = connection.execute(
                "SELECT 1 FROM settings WHERE id = 1"
            ).fetchone()
            if default_row is None:
                connection.execute(
                    """
                    INSERT INTO settings (
                        id,
                        work_minutes,
                        short_break_minutes,
                        long_break_minutes,
                        long_break_interval
                    ) VALUES (1, 25, 5, 15, 4)
                    """
                )

    def reset(self):
        with self._connect() as connection:
            connection.execute("DELETE FROM sessions")
            connection.execute("DELETE FROM settings")
            connection.execute(
                """
                INSERT INTO settings (
                    id,
                    work_minutes,
                    short_break_minutes,
                    long_break_minutes,
                    long_break_interval
                ) VALUES (1, 25, 5, 15, 4)
                """
            )

    def get_settings(self):
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT work_minutes, short_break_minutes, long_break_minutes, long_break_interval
                FROM settings
                WHERE id = 1
                """
            ).fetchone()

        return {
            "work_minutes": row["work_minutes"],
            "short_break_minutes": row["short_break_minutes"],
            "long_break_minutes": row["long_break_minutes"],
            "long_break_interval": row["long_break_interval"],
        }

    def update_settings(self, payload):
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE settings
                SET
                    work_minutes = ?,
                    short_break_minutes = ?,
                    long_break_minutes = ?,
                    long_break_interval = ?
                WHERE id = 1
                """,
                (
                    payload["work_minutes"],
                    payload["short_break_minutes"],
                    payload["long_break_minutes"],
                    payload["long_break_interval"],
                ),
            )

        return self.get_settings()

    def create_session(self, session_type, duration_sec, created_at=None):
        created_at = created_at or datetime.now()
        created_at_str = created_at.isoformat(timespec="seconds")

        with self._connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO sessions (session_type, duration_sec, created_at)
                VALUES (?, ?, ?)
                """,
                (session_type, duration_sec, created_at_str),
            )
            session_id = cursor.lastrowid

        return {
            "id": session_id,
            "session_type": session_type,
            "duration_sec": duration_sec,
            "created_at": created_at_str,
        }

    def get_stats_for_date(self, target_date):
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT
                    COUNT(*) AS completed_work_count,
                    COALESCE(SUM(duration_sec), 0) AS focus_seconds
                FROM sessions
                WHERE session_type = 'work'
                  AND date(created_at) = ?
                """,
                (target_date.isoformat(),),
            ).fetchone()

        return {
            "completed_work_count": int(row["completed_work_count"]),
            "focus_seconds": int(row["focus_seconds"]),
        }
