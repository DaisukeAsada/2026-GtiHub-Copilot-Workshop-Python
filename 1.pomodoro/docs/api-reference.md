# APIリファレンス

ポモドーロタイマーアプリのREST APIリファレンスです。すべてのリクエスト/レスポンスはJSON形式で統一されています。

---

## エンドポイント一覧

| メソッド | パス                     | 説明                       |
|----------|--------------------------|----------------------------|
| GET      | `/`                      | メイン画面HTML              |
| GET      | `/api/settings`          | タイマー設定取得            |
| PUT      | `/api/settings`          | タイマー設定更新            |
| POST     | `/api/sessions/complete` | セッション完了記録          |
| GET      | `/api/stats/today`       | 本日の統計取得              |

---

## GET `/`

HTMLページを返します。

**レスポンス**: `text/html` (200)

---

## GET `/api/settings`

現在のタイマー設定を返します。

**レスポンス** `200 OK`

````json
{
  "work_minutes": 25,
  "short_break_minutes": 5,
  "long_break_minutes": 15,
  "long_break_interval": 4
}
````

---

## PUT `/api/settings`

タイマー設定を更新します。

**リクエストボディ**

````json
{
  "work_minutes": 30,
  "short_break_minutes": 6,
  "long_break_minutes": 20,
  "long_break_interval": 5
}
````

| フィールド              | 型      | 制約                     |
|-------------------------|---------|--------------------------|
| `work_minutes`          | integer | 1以上の正の整数           |
| `short_break_minutes`   | integer | 1以上の正の整数           |
| `long_break_minutes`    | integer | 1以上の正の整数           |
| `long_break_interval`   | integer | 2以上の正の整数           |

**レスポンス** `200 OK` — 更新後の設定を返します。

````json
{
  "work_minutes": 30,
  "short_break_minutes": 6,
  "long_break_minutes": 20,
  "long_break_interval": 5
}
````

**エラーレスポンス** `400 Bad Request`

````json
{
  "error": "long_break_interval must be >= 2"
}
````

バリデーションエラーの例:
- ペイロードがオブジェクトでない場合: `"payload must be an object"`
- 必須キーが不足/余分な場合: `"settings keys are invalid"`
- 値が正の整数でない場合: `"<key> must be a positive integer"`
- `long_break_interval` が2未満の場合: `"long_break_interval must be >= 2"`

---

## POST `/api/sessions/complete`

完了したセッションを記録します。

**リクエストボディ**

````json
{
  "session_type": "work",
  "duration_sec": 1500
}
````

| フィールド      | 型      | 値                                    |
|-----------------|---------|---------------------------------------|
| `session_type`  | string  | `"work"` / `"short_break"` / `"long_break"` |
| `duration_sec`  | integer | 1以上の正の整数（セッション秒数）      |

**レスポンス** `201 Created`

````json
{
  "id": 1,
  "session_type": "work",
  "duration_sec": 1500,
  "created_at": "2026-06-09T14:00:00"
}
````

| フィールド     | 型      | 説明                            |
|----------------|---------|---------------------------------|
| `id`           | integer | 自動採番ID                      |
| `session_type` | string  | セッション種別                  |
| `duration_sec` | integer | セッション秒数                  |
| `created_at`   | string  | ISO 8601形式（秒精度、UTC非保証）|

**エラーレスポンス** `400 Bad Request`

````json
{
  "error": "session_type is invalid"
}
````

---

## GET `/api/stats/today`

当日（サーバーローカル日付基準）の作業セッション統計を返します。

**レスポンス** `200 OK`

````json
{
  "completed_work_count": 3,
  "focus_seconds": 4500
}
````

| フィールド              | 型      | 説明                               |
|-------------------------|---------|------------------------------------|
| `completed_work_count`  | integer | 当日完了した作業セッション数        |
| `focus_seconds`         | integer | 当日の作業セッション合計秒数        |

> **注意**: 休憩セッション（`short_break`、`long_break`）は集計対象外です。
