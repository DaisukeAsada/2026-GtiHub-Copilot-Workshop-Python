from pathlib import Path

from flask import Flask, jsonify, render_template, request

from repositories.sqlite_repository import SQLiteRepository
from services.stats_service import StatsService


app = Flask(__name__)

_project_root = Path(__file__).resolve().parent
_db_path = _project_root / "data" / "pomodoro.db"
repository = SQLiteRepository(str(_db_path))
stats_service = StatsService(repository)


def _validate_settings(payload):
	required_keys = {
		"work_minutes",
		"short_break_minutes",
		"long_break_minutes",
		"long_break_interval",
	}

	if not isinstance(payload, dict):
		return False, "payload must be an object"

	if set(payload.keys()) != required_keys:
		return False, "settings keys are invalid"

	for key in required_keys:
		value = payload[key]
		if not isinstance(value, int) or value <= 0:
			return False, f"{key} must be a positive integer"

	if payload["long_break_interval"] < 2:
		return False, "long_break_interval must be >= 2"

	return True, None


def _validate_session_payload(payload):
	if not isinstance(payload, dict):
		return False, "payload must be an object"

	session_type = payload.get("session_type")
	if session_type not in {"work", "short_break", "long_break"}:
		return False, "session_type is invalid"

	duration_sec = payload.get("duration_sec")
	if not isinstance(duration_sec, int) or duration_sec <= 0:
		return False, "duration_sec must be a positive integer"

	return True, None


def reset_database_state():
	repository.reset()


@app.route("/")
def index():
	return render_template("index.html")


@app.get("/api/settings")
def get_settings():
	return jsonify(repository.get_settings())


@app.put("/api/settings")
def update_settings():
	payload = request.get_json(silent=True)
	is_valid, error = _validate_settings(payload)
	if not is_valid:
		return jsonify({"error": error}), 400

	updated_settings = repository.update_settings(payload)
	return jsonify(updated_settings)


@app.post("/api/sessions/complete")
def complete_session():
	payload = request.get_json(silent=True)
	is_valid, error = _validate_session_payload(payload)
	if not is_valid:
		return jsonify({"error": error}), 400

	session = repository.create_session(
		payload["session_type"],
		payload["duration_sec"],
	)

	return jsonify(session), 201


@app.get("/api/stats/today")
def get_today_stats():
	return jsonify(stats_service.get_today_stats())


if __name__ == "__main__":
	app.run()
