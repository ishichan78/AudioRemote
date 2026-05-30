# 🎮 AudioRemote

iPhoneから Android / 別のiPhone を**異なるネットワーク越しにリモート制御**するアプリです。  
音声ファイルの再生・停止・音量調整・バイブレーション送信をワンタップで操作できます。

---

## 📱 デモ

| コントローラー画面 | 被制御端末画面 |
|:---:|:---:|
| 音声選択・再生モード・バイブ送信 | ファイル登録・再生状態表示 |

---

## ✨ 機能

- 🎵 **音声ファイルの登録** — 被制御端末のストレージから選択して登録
- ▶ **リモート再生 / 停止** — 異なるWi-Fi・モバイル回線間でも動作
- 🔁 **3つの再生モード**
  - 1回のみ再生
  - 止めるまでリピート
  - 指定時刻まで再生（時刻に自動停止）
- 🔈 **音量リモートコントロール** — スライダーでリアルタイム調整
- 📳 **バイブレーション送信** — 短い / 長い / パターンの3種類
- 🔄 **役割切り替え** — どの端末でもコントローラー / 被制御端末を選択可能

---

## 🏗️ アーキテクチャ

```
[コントローラー端末]          [被制御端末]
  iPhone / Android    ←→    iPhone / Android
         ↕                         ↕
   [Firebase Realtime Database]
   ・audioFiles/   音声ファイルのメタデータ
   ・command       再生 / 停止 / バイブコマンド
   ・volume        音量 (0.0 〜 1.0)
```

音声ファイル本体はクラウドに送信されず、**被制御端末内に保存**されます。  
Firebase には名前・ローカルURIなどのメタデータのみ保存されるため、通信量は非常に少量です。

---

## 🛠️ 技術スタック

| 項目 | 技術 |
|---|---|
| フレームワーク | [Expo](https://expo.dev/) (React Native) |
| クラウド中継 | [Firebase Realtime Database](https://firebase.google.com/) |
| 音声再生 | [expo-av](https://docs.expo.dev/versions/latest/sdk/av/) |
| ファイル選択 | [expo-document-picker](https://docs.expo.dev/versions/latest/sdk/document-picker/) |
| 触覚フィードバック | [expo-haptics](https://docs.expo.dev/versions/latest/sdk/haptics/) |
| 音量スライダー | [@react-native-community/slider](https://github.com/callstack/react-native-slider) |

---

## 📦 セットアップ

### 1. 前提条件

- [Node.js](https://nodejs.org/) (v18以上)
- [Yarn](https://yarnpkg.com/)
- [Expo Go](https://expo.dev/go)（テスト端末にインストール）
- Googleアカウント（Firebase用）

### 2. Firebase プロジェクトの作成

1. [Firebase コンソール](https://console.firebase.google.com/) でプロジェクトを新規作成
2. 左メニュー「**Build**」→「**Realtime Database**」→「データベースを作成」
3. ロケーションを選択（日本から使う場合は `asia-southeast1` 推奨）
4. 「**テストモードで開始**」を選択
5. 「プロジェクトの設定（歯車）」→「ウェブアプリを追加」→ 設定値をコピー

**Realtime Database のルール設定（「ルール」タブ）：**

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

### 3. リポジトリのセットアップ

```bash
# プロジェクト作成
npx create-expo-app AudioRemote --template blank
cd AudioRemote

# 依存パッケージのインストール
yarn add firebase
npx expo install expo-av expo-document-picker expo-haptics @react-native-community/slider
```

### 4. Firebase 設定ファイルの編集

`firebaseConfig.js` の `YOUR_...` 部分を Firebase コンソールの値に書き換えます。

```js
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL:       "https://YOUR_PROJECT_ID-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId:             "YOUR_APP_ID",
};
```

> `databaseURL` のリージョン部分はプロジェクト作成時に選択したリージョンに合わせてください。  
> 米国（デフォルト）: `https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com`

### 5. ファイル配置

```
AudioRemote/
├── App.js
├── firebaseConfig.js
├── ControllerScreen.js
└── ControlledScreen.js
```

### 6. 起動

```bash
yarn expo start
```

両端末の **Expo Go** アプリでQRコードをスキャンして起動します。

---

## 🚀 使い方

### 初回起動

各端末で役割を選択します。

```
┌─────────────────────────┐
│  📱 コントローラー       │  ← 操作する側
│  🔊 被制御端末           │  ← 操作される側
└─────────────────────────┘
```

### 音声ファイルの登録（被制御端末）

1. 「被制御端末」を選択
2. 「＋ 音声ファイルを登録」をタップ
3. 端末内の音声ファイルを選択

### 再生操作（コントローラー）

1. 「コントローラー」を選択
2. 登録済みファイルの一覧が表示される
3. ファイルをタップ → 再生モードを選択 → 「▶ 再生」

| 再生モード | 動作 |
|---|---|
| 1回のみ再生 | 最後まで再生して自動終了 |
| 止めるまでリピート | 停止コマンドが来るまでループ |
| 指定時刻まで再生 | 設定した時刻に自動停止 |

### 音量調整

コントローラー画面のスライダーを操作すると、被制御端末の再生音量がリアルタイムで変化します。

### バイブレーション送信

| ボタン | 動作 |
|---|---|
| 短い | 1回の振動 |
| 長い | 強い振動 × 3回 |
| パターン | 3連続パルス |

> iOS はシミュレーターではバイブレーションが動作しません。実機が必要です。

---

## 📁 ファイル構成

```
AudioRemote/
├── App.js                  # エントリーポイント・役割選択画面
├── firebaseConfig.js       # Firebase 初期化設定
├── ControllerScreen.js     # コントローラー画面
│                           #   再生/停止・音量・バイブ・再生モード選択
└── ControlledScreen.js     # 被制御端末画面
                            #   ファイル登録・音声再生・バイブ受信
```

---

## 🔥 Firebase 使用量について

このアプリが Firebase に保存するのはメタデータ（ファイル名・ローカルURI）と操作コマンドのみです。  
音声ファイル本体は Firebase を経由しないため、**無料プラン（Spark プラン）の範囲内で十分に動作**します。

| 無料枠 | 上限 | このアプリの目安 |
|---|---|---|
| 同時接続数 | 100 | 2〜数台 |
| データ容量 | 1 GB | 数十 KB 程度 |
| 月間通信量 | 10 GB | 数百 KB 程度 |

Firebase は**自動で有料プランに移行しません**。手動でアップグレードしない限り課金されることはありません。

---

## ⚠️ 注意事項

- 音声ファイルは登録した被制御端末内にのみ存在します。端末を変えた場合は再登録が必要です。
- 「指定時刻まで再生」はアプリがバックグラウンドになると、OSによってタイマーが終了する場合があります。
- Firebase のルールを `true` に設定しているため、URLを知っている第三者が操作できます。個人・家庭内利用を推奨します。本番運用では [Firebase Authentication](https://firebase.google.com/docs/auth) の導入を検討してください。

---

## 📄 ライセンス

MIT