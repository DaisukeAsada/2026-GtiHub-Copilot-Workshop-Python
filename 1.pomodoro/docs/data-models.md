# データモデル仕様

ポモドーロタイマーアプリが使用するデータモデルを定義します。

データストアは SQLite（`data/pomodoro.db`）を使用します。

---

## テーブル一覧

### `settings`

タイマー設定を格納します。常に `id = 1` の1行のみ存在します。

| カラム名               | 型      | 制約                          | 説明                        |
|------------------------|---------|-------------------------------|-----------------------------|
| `id`                   | INTEGER | PRIMARY KEY, CHECK (id = 1)  | 固定ID（常に1）              |
| `work_minutes`         | INTEGER | NOT NULL                      | 作業セッション時間（分）     |
| `short_break_minutes`  | INTEGER | NOT NULL                      | 短休憩時間（分）             |
| `long_break_minutes`   | INTEGER | NOT NULL                      | 長休憩時間（分）             |
| `long_break_interval`  | INTEGER | NOT NULL                      | 長休憩に入るまでの作業回数   |

**デフォルト値**:

| カラム名               | デフォルト値 |
|------------------------|-------------|
| `work_minutes`         | 25          |
| `short_break_minutes`  | 5           |
| `long_break_minutes`   | 15          |
| `long_break_interval`  | 4           |

**バリデーションルール**（APIレイヤー）:
- 全フィールドが必須（過不足なし）
- 各値は正の整数（`> 0`）
- `long_break_interval` は 2 以上

---

### `sessions`

完了したセッションの履歴を格納します。

| カラム名       | 型      | 制約                    | 説明                                        |
|----------------|---------|-------------------------|---------------------------------------------|
| `id`           | INTEGER | PRIMARY KEY AUTOINCREMENT | 自動採番ID                                |
| `session_type` | TEXT    | NOT NULL                | セッション種別（後述）                      |
| `duration_sec` | INTEGER | NOT NULL                | セッション秒数                              |
| `created_at`   | TEXT    | NOT NULL                | 完了時刻（ISO 8601形式、例: `2026-06-09T14:00:00`）|

**`session_type` の取りうる値**:

| 値            | 説明       |
|---------------|------------|
| `work`        | 作業セッション |
| `short_break` | 短休憩      |
| `long_break`  | 長休憩      |

**バリデーションルール**（APIレイヤー）:
- `session_type` は上記3値のいずれか
- `duration_sec` は正の整数（`> 0`）

---

## APIレスポンスでのデータ表現

### 設定オブジェクト

````json
{
  "work_minutes": 25,
  "short_break_minutes": 5,
  "long_break_minutes": 15,
  "long_break_interval": 4
}
````

### セッションオブジェクト

````json
{
  "id": 1,
  "session_type": "work",
  "duration_sec": 1500,
  "created_at": "2026-06-09T14:00:00"
}
````

### 統計オブジェクト

````json
{
  "completed_work_count": 3,
  "focus_seconds": 4500
}
````

> **注意**: 統計集計では `session_type = 'work'` のセッションのみを対象とします。休憩セッションは集計されません。

---

## フロントエンドのローカルストレージ

タイマーの状態は `localStorage` に JSON 形式で保存されます。

**キー**: `"pomodoro.timerState.v1"`

**値のスキーマ**:

````json
{
  "currentMode": "work",
  "completedWorkSessions": 2,
  "remainingSeconds": 750,
  "deadlineMs": 1749470400000,
  "isRunning": true
}
````

| フィールド              | 型               | 説明                                                    |
|-------------------------|------------------|---------------------------------------------------------|
| `currentMode`           | string           | `"work"` / `"short_break"` / `"long_break"` のいずれか |
| `completedWorkSessions` | integer (>= 0)   | 完了した作業セッション数                                 |
| `remainingSeconds`      | number (>= 0)    | 残り秒数                                                |
| `deadlineMs`            | number or null   | タイマー終了予定時刻（ミリ秒）。停止中は `null`         |
| `isRunning`             | boolean          | タイマー動作中フラグ                                    |

**バリデーション**（`parsePersistedTimerState` 関数）:
- `currentMode` が有効な3値のいずれかでない場合: `null` を返す
- `completedWorkSessions` が0以上の整数でない場合: `null` を返す
- `remainingSeconds` が0以上の有限数でない場合: `null` を返す
- `isRunning` がbooleanでない場合: `null` を返す
- `deadlineMs` が有限数でない場合: `null` に正規化（エラーではない）
