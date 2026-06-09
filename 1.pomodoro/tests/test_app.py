from app import app as flask_app


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
