# Tweet.app Enhancer

[app.tweet.app](https://app.tweet.app) 向けの機能拡張です。フォントサイズ・コンテンツ幅の調整、リンクカード表示、常時表示の投稿欄、投稿の翻訳挿入、複数画像のスワイプ表示、インラインリプライへの`@handle`自動入力を追加します。すべての設定はアプリの `/settings` ページ内から切り替えられます。

An enhancement for [app.tweet.app](https://app.tweet.app) that adds font size / content width adjustment, link preview cards, an always-visible composer, compose-time translation, a swipeable multi-photo gallery, and automatic `@handle` prefill for inline replies. All features are toggled from the app's own `/settings` page.

配布形態は3種類あり、機能・設定項目・デフォルト値は完全に同一です。

Three distribution formats are available, with identical features, settings, and defaults.

| | userscript版 | Chrome拡張版(アイコンあり) | Chrome拡張版(アイコンなし) |
|---|---|---|---|
| フォルダ / Folder | `/userscript` | `/chrome-extension` | `/chrome-extension-noicon` |
| 必要なもの / Requires | Tampermonkey等のユーザースクリプトマネージャー / A userscript manager (e.g. Tampermonkey) | Chromeのみ / Chrome only | Chromeのみ / Chrome only |
| 違い / Difference | — | `icons/` フォルダとmanifestのicons指定あり / includes `icons/` and manifest icon entries | アイコン指定なし(Chrome既定アイコンで表示) / no icon entries (uses Chrome's default icon) |
| 動作確認環境 / Tested on | iPad Safari + Tampermonkey | (Chrome — 動作確認環境は各自の利用環境による / see disclaimer below) | (同上 / same as above) |

## 免責事項 / Disclaimer

**無保証・無サポートです。自己責任でご利用ください。**
userscript版は **iPad版Safari + Tampermonkey機能拡張の組み合わせでのみ** 動作確認をしています。他の環境(Mac/iPhone版Safari、他ブラウザ、他のユーザースクリプトマネージャー等)での動作は未確認です。Chrome拡張版(アイコンあり/なしとも)も同様に、限定的な環境でのみ動作確認をしています。`app.tweet.app`側の仕様変更により、いずれの版も予告なく動作しなくなる可能性があります。

**Provided as-is, with no warranty and no support.** Use at your own risk.
The userscript version has only been tested on **iPad Safari with the Tampermonkey extension**. Behavior on other environments (Mac/iPhone Safari, other browsers, other userscript managers) is unverified. The Chrome extension versions (with or without icons) have likewise only been tested in a limited environment. Any version may stop working without notice if `app.tweet.app` changes its markup or behavior.

---

## userscript版のインストール / Installing the userscript

1. TampermonkeyをSafariに導入(App Store)

   Install the Tampermonkey extension for Safari (App Store)
2. Tampermonkeyメニュー→「新規スクリプトを追加」

   Tampermonkey menu → "Create a new script"
3. `/userscript/tweet-app-enhancer_user.js` の内容を貼り付けて保存(Cmd+S)

   Paste the contents of `/userscript/tweet-app-enhancer_user.js` and save (Cmd+S)
4. `app.tweet.app` を開くと自動的に有効化

   Open `app.tweet.app` — the script activates automatically

## Chrome拡張版のインストール / Installing the Chrome extension

Tampermonkey不要で、対象フォルダをそのままパッケージ化されていない拡張機能として読み込みます。アイコンあり版(`/chrome-extension`)・アイコンなし版(`/chrome-extension-noicon`)のどちらも手順は同じです。

No Tampermonkey required — load the target folder directly as an unpacked extension. The steps are identical for both the icon version (`/chrome-extension`) and the no-icon version (`/chrome-extension-noicon`).

1. このリポジトリをクローンまたはダウンロード

   Clone or download this repository
2. `chrome://extensions` を開く

   Open `chrome://extensions`
3. 右上の「デベロッパーモード」をONにする

   Turn on "Developer mode" (top right)
4. 「パッケージ化されていない拡張機能を読み込む」をクリックし、使用したい方のフォルダ(`/chrome-extension` または `/chrome-extension-noicon`)を選択

   Click "Load unpacked" and select whichever folder you want to use (`/chrome-extension` or `/chrome-extension-noicon`)
5. `app.tweet.app` を開くと自動的に有効化

   Open `app.tweet.app` — the extension activates automatically

### Chrome拡張版の構成 / Chrome extension contents

- `manifest.json` — 拡張機能の定義(Manifest V3) / extension definition (Manifest V3)
- `content.js` — app.tweet.app に注入されるメインスクリプト(userscript本体の移植版) / main script injected into app.tweet.app (ported from the userscript)
- `background.js` — 翻訳API・リンク先ページのfetchを中継するservice worker / service worker that relays fetches for the translate API and linked pages
- `icons/`(`/chrome-extension` のみ) — 拡張機能アイコン(app.tweet.appのブランドアセットを使用) / extension icons (using app.tweet.app's brand asset) — icon version only

userscript版との技術的な違いは通信・保存方式のみです: `GM_setValue`/`GM_getValue` → `chrome.storage.local`、`GM_xmlhttpRequest` → `background.js`経由の`fetch`。
The only technical differences from the userscript are storage and networking: `GM_setValue`/`GM_getValue` → `chrome.storage.local`, and `GM_xmlhttpRequest` → `fetch` relayed through `background.js`.

---

## 機能と設定 / Features & Settings

`/settings` ページの「Display」セクション内に **Tweet.app Enhancements** というカードが追加されます(全バージョン共通)。
A **Tweet.app Enhancements** card is added under the "Display" section of the `/settings` page (identical across all versions).

| 設定 / Setting | 説明 / Description | 初期値 / Default |
|---|---|---|
| Font size | ツイート本文の文字サイズ / Text size for tweets | 15px |
| Content width | 画像・動画・リンクカードの表示幅(記事内、News/Sportsタブのリンクカードにも適用) / Width of media and link cards (applies both inside tweets and in the News/Sports tab link cards) | Default (100%) |
| Reply @handle prefill | インラインリプライ欄に相手の`@handle`を自動入力 / Prefill `@handle` when replying inline | OFF |
| Translate target language | 投稿翻訳の翻訳先言語(Noneで非表示) / Language used when translating your draft (None hides the button) | English |
| Always-visible composer | フィード最上部の投稿欄を常時表示 / Keep the tweet box visible at the top of the feed | ON |
| Swipe gallery | 複数画像ツイートをスワイプ/キーボードで切替表示 / Swipe or use arrow keys to browse multi-photo tweets | OFF |
| Video/GIF autoplay | スクロール中の動画・GIF自動再生 / Autoplay videos and GIFs while scrolling | ON |
| Link card previews | 本文URLのOGPリンクカード表示 / Show OGP preview cards for links in tweet text | OFF |
| Link card cache | リンクカードのキャッシュをクリア / Clear cached link preview data | (操作ボタン / action button) |

投稿欄には翻訳ボタンも追加され、押すと選択言語への翻訳をプレビューし、再度押すと投稿欄末尾に挿入します。
The compose box also gets a translate button: tap it to preview a translation in the target language, tap the preview to insert it at the end of your draft.

## 仕組み / How it works

- 投稿翻訳はGoogle翻訳の非公式エンドポイント(`translate.googleapis.com`)を使用し、レート制限(HTTP 429)時は別エンドポイント(`clients5.google.com`)へ自動フォールバックします。

  Translation uses Google Translate's unofficial endpoint (`translate.googleapis.com`), with automatic fallback to a secondary endpoint (`clients5.google.com`) when rate-limited (HTTP 429).
- リンクカードはfetchしたページのOGPタグを解析し、キャッシュします(userscript版: GM storage / Chrome拡張版: `chrome.storage.local`)。

  Link cards are built by fetching and parsing OGP tags from the linked page, then cached (userscript: GM storage / Chrome extension: `chrome.storage.local`).

## 注意 / Notes

- 非公式のGoogle翻訳エンドポイントに依存しているため、Google側の仕様変更で翻訳機能が動作しなくなる可能性があります。

  Relies on an unofficial Google Translate endpoint and may break if Google changes its response format.
- `app.tweet.app` のDOM構造変更により、機能の一部またはすべてが動作しなくなる可能性があります。

  Features may break if `app.tweet.app` changes its DOM structure.
- Issue・PR等によるサポートは行っていません。

  No support is provided via issues or pull requests.

## License

MIT
