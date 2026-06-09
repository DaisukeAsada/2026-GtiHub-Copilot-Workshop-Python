# フロントエンドモジュール仕様

ポモドーロタイマーのフロントエンド実装を説明するドキュメントです。

---

## ファイル構成

| ファイル                    | 役割                                        |
|-----------------------------|---------------------------------------------|
| `static/js/timer_core.mjs`  | タイマードメインロジック（純粋関数・ESModule） |
| `static/js/timer.js`        | UIアプリケーション制御（状態管理・API通信）   |
| `static/css/style.css`      | スタイルシート（CSS変数によるテーマ管理）     |
| `templates/index.html`      | メイン画面HTML                               |

---

## `timer_core.mjs` — ドメインロジックモジュール

副作用を持たない純粋関数のみで構成されたESModuleです。Node.js環境でのユニットテスト（`timer_core.test.mjs`）が可能です。

### エクスポート関数

#### `clamp(value, min, max): number`

値を `[min, max]` の範囲にクランプします。

````javascript
clamp(-5, 0, 10)  // => 0
clamp(15, 0, 10)  // => 10
clamp(3, 0, 10)   // => 3
````

---

#### `formatTime(seconds): string`

秒数を `"MM:SS"` 形式の文字列に変換します。小数点以下は切り捨てます。

````javascript
formatTime(1500)  // => "25:00"
formatTime(61.9)  // => "01:01"
formatTime(0)     // => "00:00"
````

---

#### `computeRemainingSeconds({ targetDeadlineMs, currentMs, totalDurationSeconds, fallbackSeconds }): number`

現在時刻と終了予定時刻から残り秒数を計算します。`targetDeadlineMs` が `null` の場合は `fallbackSeconds` を返します。

| パラメータ             | 型             | 説明                              |
|------------------------|----------------|-----------------------------------|
| `targetDeadlineMs`     | number or null | タイマー終了予定時刻（ミリ秒）    |
| `currentMs`            | number         | 現在時刻（ミリ秒）                |
| `totalDurationSeconds` | number         | セッションの合計秒数              |
| `fallbackSeconds`      | number         | deadlineがnullの場合のフォールバック|

---

#### `computeProgressPercent(remainingSeconds, totalDurationSeconds): number`

残り時間の割合（0〜100）を計算します。`totalDurationSeconds` が0の場合は0を返します。

````javascript
computeProgressPercent(1500, 1500)  // => 100
computeProgressPercent(750, 1500)   // => 50
computeProgressPercent(0, 1500)     // => 0
````

---

#### `getModeDurationSeconds(mode, durations): number`

モード名に対応する合計秒数を返します。未知のモードは例外をスローします。

| パラメータ  | 型     | 説明                                    |
|-------------|--------|-----------------------------------------|
| `mode`      | string | `"work"` / `"short_break"` / `"long_break"` |
| `durations` | object | `{ work, shortBreak, longBreak }`（秒）  |

---

#### `computeNextSession({ currentMode, completedWorkSessions, longBreakInterval }): object`

現在のモードと完了セッション数から次のセッション情報を計算します。

**戻り値**:

````javascript
{
  nextMode: "short_break",  // 次のモード
  completedWorkSessions: 1, // 更新後の完了数
}
````

**モード遷移ルール**:
- `work` → 作業完了数が `longBreakInterval` の倍数なら `long_break`、それ以外は `short_break`
- `short_break` / `long_break` → `work`

---

#### `parsePersistedTimerState(raw): object | null`

`localStorage` から取得した文字列をパースし、タイマー状態オブジェクトを返します。無効な場合は `null` を返します。

**戻り値スキーマ**（正常時）:

````javascript
{
  currentMode: "work",
  completedWorkSessions: 0,
  remainingSeconds: 1500,
  deadlineMs: null,
  isRunning: false,
}
````

---

#### `resolveRestoredTimerState({ persistedState, currentMs, durations, longBreakInterval }): object`

ページ再読み込み後のタイマー状態を復元します。タイマーが動作中だった場合、経過時間を考慮して残り時間を再計算します。

**戻り値スキーマ**:

````javascript
{
  currentMode: "work",
  completedWorkSessions: 0,
  totalDurationSeconds: 1500,
  remainingSeconds: 750,
  isRunning: true,
  deadlineMs: 1749470400000,
}
````

---

## `timer.js` — UIアプリケーション制御モジュール

`timer_core.mjs` をインポートし、DOM操作・状態管理・API通信を担当します。

### 定数

| 定数            | 値                                                | 説明                        |
|-----------------|---------------------------------------------------|-----------------------------|
| `DURATIONS`     | `{ work: 1500, shortBreak: 300, longBreak: 900 }` | デフォルト秒数（API取得後に更新）|
| `STORAGE_KEY`   | `"pomodoro.timerState.v1"`                        | localStorage キー           |
| `MODE_LABELS`   | 日本語ラベルのマップ                               | モード名→表示テキスト       |

### 主要な状態変数

| 変数                    | 型      | 説明                          |
|-------------------------|---------|-------------------------------|
| `currentMode`           | string  | 現在のモード                  |
| `completedWorkSessions` | number  | 完了した作業セッション数       |
| `totalDurationSeconds`  | number  | 現在モードの合計秒数           |
| `remainingSeconds`      | number  | 残り秒数                      |
| `deadlineMs`            | number or null | タイマー終了予定時刻   |
| `isRunning`             | boolean | 動作中フラグ                  |
| `longBreakInterval`     | number  | 長休憩間隔（API取得後に更新）  |

### 主要な関数

| 関数                       | 説明                                              |
|----------------------------|---------------------------------------------------|
| `startOrResume()`          | タイマーを開始/再開する                           |
| `pause()`                  | タイマーを一時停止する                            |
| `reset()`                  | タイマーをリセット（作業モード・完了数0に戻す）   |
| `tick()`                   | 250msごとに呼ばれる更新処理                       |
| `handleCompleted()`        | セッション完了時の処理（API記録・次モード遷移）   |
| `persistState()`           | タイマー状態をlocalStorageに保存                  |
| `restoreStateFromStorage()` | localStorageから状態を復元                       |
| `render()`                 | DOM要素を現在の状態で更新                         |
| `fetchSettings()`          | `GET /api/settings` を呼び出す                    |
| `updateSettings(payload)`  | `PUT /api/settings` を呼び出す                    |
| `postSessionComplete(type, sec)` | `POST /api/sessions/complete` を呼び出す    |
| `fetchTodayStats()`        | `GET /api/stats/today` を呼び出す                 |

### タイマーの精度

250ms間隔の `setInterval` を使いますが、残り時間の計算は `deadline - Date.now()` で行います（ドリフト耐性）。

### ブラウザ通知・通知音

- Web Audio API（`AudioContext`）で正弦波の通知音を再生（880Hz、0.2秒）
- Web Notifications API でブラウザ通知を送信（許可が必要）

### グローバル公開API

テスト・外部スクリプト向けに `window.pomodoroApi` でAPIクライアント関数を公開しています。

````javascript
window.pomodoroApi = {
  getSettings: fetchSettings,
  updateSettings,
};
````

---

## `index.html` — 画面構造

| 要素ID                   | 説明                     |
|--------------------------|--------------------------|
| `mode-label`             | 現在のモード表示          |
| `set-count-text`         | 完了セット数表示          |
| `progress-ring`          | 円形プログレスリング      |
| `time-text`              | 残り時間テキスト（MM:SS） |
| `start-pause-btn`        | 開始/一時停止ボタン       |
| `reset-btn`              | リセットボタン            |
| `status-message`         | エラー/成功メッセージ表示  |
| `work-minutes-input`     | 作業時間入力              |
| `short-break-minutes-input` | 短休憩時間入力          |
| `long-break-minutes-input`  | 長休憩時間入力          |
| `long-break-interval-input` | 長休憩間隔入力          |
| `save-settings-btn`      | 設定保存ボタン            |
| `enable-notification-btn`| 通知有効化ボタン          |
| `stats-completed-count`  | 本日の完了セッション数    |
| `stats-focus-duration`   | 本日の集中時間            |

---

## `style.css` — スタイルシート

CSS変数でテーマカラーを一元管理しています。

| 変数名          | デフォルト値            | 用途                     |
|-----------------|-------------------------|--------------------------|
| `--bg-start`    | `#6f64d9`               | 背景グラデーション開始色  |
| `--bg-end`      | `#5d54c9`               | 背景グラデーション終了色  |
| `--card-bg`     | `#f3f3f8`               | カード背景色              |
| `--card-shadow` | `rgba(58, 48, 128, 0.2)`| カードシャドウ色          |
| `--text-main`   | `#2f323d`               | メインテキスト色          |
| `--text-sub`    | `#585d6d`               | サブテキスト色            |
| `--accent`      | `#6d79e8`               | アクセントカラー（進捗リング）|
| `--track`       | `#e3e4ea`               | プログレスリングのトラック色|
| `--stats-bg`    | `#e6e7f3`               | 統計カード背景色          |

フォント: `M PLUS Rounded 1c`（Google Fonts）、フォールバック: `Hiragino Kaku Gothic ProN`, `Meiryo`, `sans-serif`
