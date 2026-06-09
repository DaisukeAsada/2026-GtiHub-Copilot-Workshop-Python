from app import app as flask_app
from app import reset_database_state


def setup_function(_):
	reset_database_state()


def test_index_returns_200():
	client = flask_app.test_client()
	response = client.get("/")

	assert response.status_code == 200


def test_index_renders_expected_texts():
	client = flask_app.test_client()
	response = client.get("/")
	body = response.get_data(as_text=True)

	assert "ポモドーロタイマー" in body
	assert "作業中" in body
	assert "今日の進捗" in body


def test_root_route_is_registered():
	routes = {rule.rule for rule in flask_app.url_map.iter_rules()}

	assert "/" in routes


def test_get_settings_returns_defaults():
	client = flask_app.test_client()
	response = client.get("/api/settings")
	body = response.get_json()

	assert response.status_code == 200
	assert body == {
		"work_minutes": 25,
		"short_break_minutes": 5,
		"long_break_minutes": 15,
		"long_break_interval": 4,
	}


def test_put_settings_updates_values():
	client = flask_app.test_client()
	payload = {
		"work_minutes": 30,
		"short_break_minutes": 6,
		"long_break_minutes": 20,
		"long_break_interval": 5,
	}

	response = client.put("/api/settings", json=payload)
	body = response.get_json()

	assert response.status_code == 200
	assert body == payload


def test_put_settings_rejects_invalid_payload():
	client = flask_app.test_client()
	payload = {
		"work_minutes": 25,
		"short_break_minutes": 5,
		"long_break_minutes": 15,
		"long_break_interval": 1,
	}

	response = client.put("/api/settings", json=payload)
	body = response.get_json()

	assert response.status_code == 400
	assert "error" in body


def test_post_session_complete_records_work_session_and_today_stats():
	client = flask_app.test_client()

	create_response = client.post(
		"/api/sessions/complete",
		json={
			"session_type": "work",
			"duration_sec": 1500,
		},
	)
	created = create_response.get_json()

	stats_response = client.get("/api/stats/today")
	stats = stats_response.get_json()

	assert create_response.status_code == 201
	assert created["session_type"] == "work"
	assert created["duration_sec"] == 1500
	assert stats_response.status_code == 200
	assert stats == {
		"completed_work_count": 1,
		"focus_seconds": 1500,
	}


def test_post_session_complete_rejects_invalid_payload():
	client = flask_app.test_client()
	response = client.post(
		"/api/sessions/complete",
		json={
			"session_type": "work",
			"duration_sec": 0,
		},
	)
	body = response.get_json()

	assert response.status_code == 400
	assert "error" in body
