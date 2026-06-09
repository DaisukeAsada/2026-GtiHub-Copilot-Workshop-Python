# アーキテクチャ概要

ポモドーロタイマーアプリの実装済みアーキテクチャをまとめたドキュメントです。

---

## 全体構成

ブラウザ側でタイマー制御を行い、FlaskはAPIと永続化を担当します。

```
ブラウザ                        サーバー（Flask）
┌─────────────────────────┐    ┌─────────────────────────────┐
│ timer.js (アプリ制御)    │    │ app.py (Flask + ルーティング)│
│  ↕ import                │    │   ↓                         │
│ timer_core.mjs (純粋関数)│◀──▶│ StatsService                │
└─────────────────────────┘    │   ↓                         │
                               │ SQLiteRepository             │
                               │   ↓                         │
                               │ SQLite (data/pomodoro.db)   │
                               └─────────────────────────────┘
```

---

## ディレクトリ構成（実装済み）

```text
1.pomodoro/
├── app.py                         # Flaskアプリ本体・ルート定義・バリデーション
├── services/
│   └── stats_service.py           # 統計取得サービス
├── repositories/
│   └── sqlite_repository.py       # SQLiteリポジトリ実装
├── templates/
│   └── index.html                 # メイン画面HTML
├── static/
│   ├── css/
│   │   └── style.css              # スタイルシート
│   ├── js/
│   │   ├── timer_core.mjs         # タイマードメインロジック（純粋関数・ESModule）
│   │   └── timer.js               # UIアプリケーション制御（タイマー・API通信）
│   └── images/
│       └── pomodoro.png
├── tests/
│   ├── conftest.py
│   ├── test_app.py                # Flask APIの統合テスト
│   ├── test_repository_integration.py
│   └── timer_core.test.mjs        # timer_core.mjsのユニットテスト
├── requirements.txt
└── requirements-dev.txt
```

---

## レイヤー設計

### プレゼンテーション層（`templates/index.html` + `static/css/style.css`）

- HTMLで画面構造を定義
- CSSでスタイルを定義（CSS変数によるテーマ管理）
- JavaScriptはモジュールとして別ファイルで管理

### アプリケーション/UI層（`static/js/timer.js`）

- タイマーの状態管理（`currentMode`、`remainingSeconds`、`deadlineMs` など）
- ユーザー操作イベントのハンドリング（開始・一時停止・リセット・設定保存）
- APIクライアント機能（`fetch` によるREST API呼び出し）
- `localStorage` へのタイマー状態の永続化・復元
- `timer_core.mjs` の純粋関数を呼び出してロジックを実行
- ブラウザ通知（Web Notifications API）と通知音（Web Audio API）

### ドメイン層（`static/js/timer_core.mjs`）

- 副作用を持たない純粋関数のみで構成されたESModule
- タイマー残時間計算、進捗率計算、モード遷移、状態の検証・復元など
- Node.js（`node:test`）でユニットテスト可能

### サービス層（`services/stats_service.py`）

- `StatsService`: リポジトリを経由して当日の統計を取得する薄いサービス
- 依存性注入（コンストラクタでリポジトリを受け取る）

### リポジトリ層（`repositories/sqlite_repository.py`）

- `SQLiteRepository`: SQLite へのアクセスをカプセル化
- スキーマ初期化（起動時に自動作成）、設定取得/更新、セッション作成、日次統計取得
- デフォルト設定（作業25分、短休憩5分、長休憩15分、長休憩間隔4セット）を初回に挿入

### インフラ層（`app.py`）

- Flask アプリのファクトリと設定
- リポジトリ・サービスのインスタンス化（グローバルシングルトン）
- APIエンドポイントの定義とバリデーション

---

## データフロー

### タイマー動作（フロントエンド）

1. ページ読み込み時: `localStorage` から状態を復元し、`/api/settings` から設定を取得
2. タイマー開始時: `deadlineMs = Date.now() + remainingSeconds * 1000` を設定
3. 250ms ごとの `tick()`: `deadline - now` で残り秒数を再計算（ドリフト防止）
4. 残り0秒で `handleCompleted()` を呼び出し
5. 作業セッション完了時: `POST /api/sessions/complete` → `GET /api/stats/today` でUI更新
6. 状態変化のたびに `localStorage` へ保存

### 設定の取得・保存

1. ページ読み込み時: `GET /api/settings` → タイマー設定に反映
2. 設定保存時: `PUT /api/settings` → 更新後の設定を反映

---

## 状態管理

### フロントエンド状態（メモリ + localStorage）

| 変数                    | 説明                                |
|-------------------------|-------------------------------------|
| `currentMode`           | 現在のモード (`work`/`short_break`/`long_break`) |
| `completedWorkSessions` | 完了した作業セッション数             |
| `totalDurationSeconds`  | 現在モードの合計秒数                 |
| `remainingSeconds`      | 残り秒数                            |
| `deadlineMs`            | タイマー終了予定時刻（ミリ秒）       |
| `isRunning`             | タイマー動作中フラグ                 |

localStorage キー: `"pomodoro.timerState.v1"`

### バックエンド状態（SQLite）

- `settings` テーブル: タイマー設定（1行固定）
- `sessions` テーブル: 完了セッション履歴
