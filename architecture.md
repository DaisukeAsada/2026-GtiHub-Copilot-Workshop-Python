# ポモドーロタイマー Webアプリケーション アーキテクチャ案

## 1. 目的

本ドキュメントは、`Flask + HTML/CSS/JavaScript` で実装するポモドーロタイマーアプリのアーキテクチャ方針をまとめたものです。

重視する観点は以下です。

- UIモックに沿った使いやすい画面
- 秒単位で破綻しにくいタイマー精度
- 段階的な実装（まず動く、次に育てる）
- ユニットテストしやすい設計

## 2. 全体構成

ブラウザ側でタイマー制御を行い、FlaskはAPIと永続化を担当する構成とします。

- フロントエンド: 画面表示、タイマー進行、状態管理
- バックエンド（Flask）: 設定管理、セッション実績保存、日次集計API
- データストア: 初期は `localStorage`、実用フェーズで `SQLite`

## 3. レイヤー設計

### 3.1 プレゼンテーション層（UI）

- 対象: HTML/CSS/JavaScript（DOM操作）
- 役割:
  - 円形プログレスの描画
  - モード表示（作業/休憩）
  - 開始・一時停止・リセット操作
  - 本日の進捗表示

### 3.2 アプリケーション層（フロント制御）

- 役割:
  - ユーザー操作を受けてドメインロジックを呼ぶ
  - APIクライアント経由でFlaskと通信
  - ローカル状態を復元・保存
- ポイント:
  - UI更新処理と計算ロジックを分離する

### 3.3 ドメイン層（ビジネスロジック）

- 役割:
  - タイマー残時間計算
  - モード遷移（作業→短休憩→作業、4セット後に長休憩など）
  - 日次進捗の計算
- ポイント:
  - 純粋関数を中心に設計し、副作用を持たせない

### 3.4 インフラ層（Flask + Repository）

- 役割:
  - APIエンドポイント提供
  - SQLiteへの保存/取得
  - 集計ロジックのサービス化
- ポイント:
  - 永続化はRepositoryに閉じ込め、Service層から抽象経由で利用する

## 4. ディレクトリ構成案

現状の `1.pomodoro/` 配下で以下の構成を推奨します。

```text
1.pomodoro/
  app.py
  templates/
    index.html
  static/
    css/
      style.css
    js/
      timer.js
      ui.js
      api.js
      state.js
  services/
    stats_service.py
    settings_service.py
  repositories/
    session_repository.py
    settings_repository.py
  domain/
    timer_rules.py
    session_state.py
```

補足:
- `domain/` はFlask依存を持たないロジック置き場
- `services/` はユースケース単位
- `repositories/` はDBアクセス専用

## 5. タイマー実装方針（精度重視）

### 5.1 推奨アプローチ

`setInterval` で単純に1秒ずつ減算しない。

- セッション開始時に「終了予定時刻（deadline）」を決める
- 表示更新時は `deadline - now` で残り秒数を再計算する

これにより、タブ非アクティブ時や描画遅延があってもドリフトを抑えられます。

### 5.2 再読み込み耐性

- 実行状態（モード、deadline、完了数）を `localStorage` に保存
- ページ再読み込み時に状態復元し、残り時間を再計算して再開表示

## 6. API設計（初期案）

- `GET /api/settings`
  - 設定取得（作業分、短休憩分、長休憩分、長休憩に入る間隔）
- `PUT /api/settings`
  - 設定更新
- `POST /api/sessions/complete`
  - 1セッション完了を記録
- `GET /api/stats/today`
  - 当日の完了数と集中時間を返却

レスポンス形式はJSONで統一し、エラー時も共通フォーマットに揃えます。

## 7. データモデル案（SQLite）

### 7.1 settings

- `id` (PK)
- `work_minutes`
- `short_break_minutes`
- `long_break_minutes`
- `long_break_interval`
- `updated_at`

### 7.2 sessions

- `id` (PK)
- `session_type` (`work` / `short_break` / `long_break`)
- `started_at`
- `ended_at`
- `duration_sec`
- `completed` (bool)

## 8. テスト容易性を高める設計方針

### 8.1 優先して導入する改善

- ドメインロジックを純粋関数化する
- 時刻取得を注入可能にする（`now()` 直接依存を避ける）
- セッション遷移をステートマシンとして定義する
- Repositoryをインターフェース化する
- UI更新とロジックを分離する

### 8.2 テスト対象の分離

- ユニットテスト（最優先）
  - 時間計算
  - モード遷移
  - 日次集計
- 統合テスト
  - Flask API + Repository（必要に応じてインメモリDB）
- 最小限のUI結合テスト
  - ボタン操作で状態遷移が正しく起きること

### 8.3 設計ルール

- ドメイン層からDOM/DB/時刻APIを直接呼ばない
- 副作用はアプリケーション層・インフラ層に閉じ込める
- 関数は単一責務を徹底する

## 9. 開発ステップ

1. 静的UI実装（モック再現）
2. タイマー動作（開始/停止/リセット、円形進捗）
3. `localStorage` で状態復元
4. Flask API実装（settings/sessions/stats）
5. SQLite保存・集計
6. ユニットテスト/統合テスト整備

## 10. 将来拡張

- ユーザー認証導入（ユーザー別実績）
- 週次/月次の統計画面
- 通知機能の拡張（Web Notification）
- PWA化（オフライン対応）

---

この構成により、初期実装の速さと将来の保守性・テスト容易性を両立できます。
