# Tweet.app Enhancer

app.tweet.app を見やすく、使いやすくするためのユーザースクリプトです。
Tampermonkey 向けの userscript と、Chrome 拡張機能の2形式で配布します。

- バージョン: 2.3.0
- ライセンス: MIT
- 対象: https://app.tweet.app/*

> 本スクリプトは非公式です。tweet.app および関連サービスとは無関係で、各サービスの公式な支援や保証はありません。

---

## 主な機能

| 機能 | 内容 |
|---|---|
| 文字サイズ・コンテンツ幅 | 記事と投稿欄の拡大率(5%刻み)、画像・メディアの幅(5%刻み) |
| アバターの形 | 丸(既定)・角丸四角・四角から選択。プロフィール、投稿欄、ヘッダ等のアバターに適用 |
| 投稿欄の常時表示 | フィードの上部に投稿欄を常に表示/非表示 |
| 投稿欄の自動拡張 | 複数行入力で入力欄が下方向に伸びる(上端は固定、初期状態はOFF) |
| 翻訳挿入 | 投稿欄の下書きを指定言語に翻訳し、本文へ挿入 |
| GIF 検索・添付 | 投稿欄から Tenor の GIF を検索して添付(初期状態はOFF) |
| 別ウインドウで投稿 | 投稿ボタンを押すと、投稿欄だけを別ウインドウ(iPad はタブ)で開く。投稿後に閉じる(初期状態はOFF) |
| 返信 @ハンドル入力 | インライン返信欄に @ハンドルを自動入力 |
| リンクカード | 投稿内のリンクの OGP 情報をカード表示(キャッシュ付き) |
| 動画・GIF 自動再生 | 記事内の動画/GIF の自動再生を ON/OFF |
| 非表示フィルター | リポスト記事、ゲームカード(TWIRDLE 等)を非表示(ゲームカードの非表示は初期状態でOFF) |
| 時刻表示 | 相対時刻の横に絶対時刻を表示(初期状態はOFF)。形式は自由に指定可能(既定の形式: `(YYYY-MM-DD hh:mm:ss)`) |
| 通知ポップアップ | 通知件数が増えるとポップアップ表示。通知音 8 種類から選択、試聴可能 |
| 更新通知 | tweet.app のバージョン表記が変わるとポップアップと通知音でお知らせ |
| カスタム CSS | 任意の CSS を適用 |

---

## 導入方法

### userscript 版(Tampermonkey)

1. Safari(Mac/iPhone/iPad)または Chrome に Tampermonkey を入れる。
2. `tweet-app-enhancer_user.js` の内容を、Tampermonkey の新規スクリプトに貼り付けて保存する。
   - Tampermonkey の「ユーティリティ」タブからファイルをインポートすることもできます。
3. app.tweet.app を開き直す。

### Chrome 拡張機能版

1. zip を展開する。
2. Chrome で `chrome://extensions` を開き、「デベロッパーモード」を ON にする。
3. 「パッケージ化されていない拡張機能を読み込む」で、展開したフォルダを選ぶ。
4. app.tweet.app を開き直す。

> Chrome 拡張機能版は、デスクトップ版 Chrome 向けです。iPhone/iPad では userscript 版を使用してください。

---

## 設定

設定はサイドバーの **Enhancer** メニューから開きます(iPhone/iPad では、下部ナビや画面上部の表示位置から開く場合があります)。
パネルは次の順に並んでいます。

- **表示・レイアウト**: Article & Compose zoom / Avatar shape / Content width / Time stamp / Time stamp format / Hide reposts / Hide games / Video/GIF autoplay / Link card previews / Link card cache
- **投稿欄**: Always-visible composer / Auto-grow textarea / Reply @handle prefill / Translate target language
- **通知**: Notification popup / Notification sound
- **Experimental(実験的機能)**: GIF button / Compose in new tab / Custom CSS

各設定は、変更すると即座に反映されます。設定値は保存され、再読み込み後も保持されます。

---

## 仕組み

### GIF 検索・添付(Tenor)

- Tenor の API は終了しているため、Tenor の検索ページに埋め込まれている `store-cache` を読み取って検索結果を取得します。
- 検索結果の URL を投稿本文へ入れるのではなく、GIF を実際にダウンロードして File 化し、tweet.app 自身のファイル入力へ設定します。
- 投稿欄に属するファイル入力は 1 つだけ処理します。複数のファイル入力に同じ GIF を設定すると、tweet.app が「GIFs cannot be combined」と表示することがあるためです。
- 表示された赤いエラーメッセージは、自動で取り除きます。

### 別ウインドウでの投稿

- 投稿ボタン(`#public-sidebar-compose-btn` / `#public-mobile-compose-btn`)のクリックを横取りし、`?tt_compose=1` を付けた tweet.app を別ウインドウで開きます。
- 別ウインドウでは投稿ボタンを自動で押し、投稿欄以外の画面を見えなくします。
- 投稿欄が閉じた時点(投稿後またはキャンセル後)で、ウインドウを閉じます。

### 通知と更新通知

- 1 秒ごとに、通知バッジの件数と tweet.app のフッターにあるバージョン表記を確認します。
- 通知件数が増えた場合は、通知ポップアップと通知音で知らせます。
- バージョン表記が変わった場合は、更新内容をポップアップで知らせます。初回の取得時は記録のみで、通知は出しません。

### 設定の保存

- userscript 版は `GM_getValue` / `GM_setValue` を使います。
- Chrome 拡張機能版は、互換レイヤーを通して `chrome.storage.local` を使います。起動時に保存値をまとめて読み込みます。

### 外部との通信

- 翻訳には Google の翻訳エンドポイントを使います。応答が 429 の場合は、別のエンドポイントに切り替えて再試行します。
- リンクカードでは、投稿内の外部リンク先の HTML を取得して OGP 情報を読み取ります。
- GIF では Tenor の検索ページと GIF 本体を取得します。
- Chrome 拡張機能版では、これらの取得を `background.js` 経由で行います。ページの CSP や CORS の影響を受けないようにするためです。

---

## 注意

- **非公式です。** tweet.app の画面構造が変わると、一部の機能が動かなくなることがあります。特に、投稿欄やボタンの ID(`public-modal-tweet-input`、`public-sidebar-compose-btn` など)に依存しています。
- **GIF 検索は Tenor の仕様に依存します。** Tenor 側の表示形式が変わると、検索結果が取得できなくなることがあります。
- **GIF ボタンは初期状態で OFF です。** Experimental の「GIF button」を ON にすると表示されます。
- **別ウインドウでの投稿は、投稿欄が閉じると必ずウインドウを閉じます。** キャンセルした場合も閉じます。下書きは元のウインドウと共有されません。
- **翻訳は無料の非公式エンドポイントを使います。** 利用回数の制限により、失敗することがあります。
- **ブラウザによって挙動が異なります。** 別ウインドウは Mac Safari では別ウインドウ、iPad Safari ではタブで開きます。
- **通知音は、ページ上での操作後に再生されます。** ブラウザの自動再生制限により、最初のクリックやキー操作の前は鳴らないことがあります。
- **Chrome 拡張機能版は Chrome Web Store では配布していません。** 上記の手順で手動で読み込んでください。
- 本スクリプトを使うことによる、アカウントや利用規約への影響について、作者は責任を負いません。

---

## ファイル構成

```
tweet-app-enhancer_user.js   userscript 本体(Tampermonkey 用)
content.js                   Chrome 拡張機能の content script
background.js                Chrome 拡張機能の service worker(HTTP 取得の中継)
manifest.json                Chrome 拡張機能のマニフェスト
notification-sound-demo.html 通知音の試聴用デモ(任意)
README.md                    このファイル
```

---

## ライセンス

MIT License
