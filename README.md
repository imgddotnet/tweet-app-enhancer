# Tweet.app Enhancer

[app.tweet.app](https://app.tweet.app) 向けのTampermonkeyユーザースクリプト。フォントサイズ・コンテンツ幅の調整、リンクカード表示、常時表示の投稿欄、投稿の翻訳挿入、複数画像のスワイプ表示、インラインリプライへの`@handle`自動入力を追加します。すべての設定はアプリの `/settings` ページ内から切り替えられます。

A Tampermonkey userscript for [app.tweet.app](https://app.tweet.app) that adds font size / content width adjustment, link preview cards, an always-visible composer, compose-time translation, a swipeable multi-photo gallery, and automatic `@handle` prefill for inline replies. All features are toggled from the app's own `/settings` page.

## 免責事項 / Disclaimer

**無保証・無サポートです。自己責任でご利用ください。**
本スクリプトはiPad版Safari + Tampermonkey機能拡張の組み合わせでのみ動作確認をしています。他の環境(Mac/iPhone版Safari、他ブラウザ、他のユーザースクリプトマネージャー等)での動作は未確認です。`app.tweet.app`側の仕様変更により、予告なく動作しなくなる可能性があります。

**Provided as-is, with no warranty and no support.** Use at your own risk.
This script has only been tested on **iPad Safari with the Tampermonkey extension**. Behavior on other environments (Mac/iPhone Safari, other browsers, other userscript managers) is unverified. It may stop working without notice if `app.tweet.app` changes its markup or behavior.

## インストール / Installation

1. TampermonkeyをSafariに導入(App Store)
   Install the Tampermonkey extension for Safari (App Store)
2. Tampermonkeyメニュー→「新規スクリプトを追加」
   Tampermonkey menu → "Create a new script"
3. `tweet-app-enhancer_user.js` の内容を貼り付けて保存(Cmd+S)
   Paste the contents of `tweet-app-enhancer_user.js` and save (Cmd+S)
4. `app.tweet.app` を開くと自動的に有効化
   Open `app.tweet.app` — the script activates automatically

## 機能と設定 / Features & Settings

`/settings` ページの「Display」セクション内に **Tweet.app Enhancements** というカードが追加されます。
A **Tweet.app Enhancements** card is added under the "Display" section of the `/settings` page.

| 設定 / Setting | 説明 / Description | 初期値 / Default |
|---|---|---|
| Font size | ツイート本文の文字サイズ / Text size for tweets | 15px |
| Content width | 画像・動画・リンクカードの表示幅 / Width of media and content | Default (100%) |
| Reply @handle prefill | インラインリプライ欄に相手の`@handle`を自動入力 / Prefill `@handle` when replying inline | OFF |
| Translate target language | 投稿翻訳の翻訳先言語 / Language used when translating your draft | English |
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
- リンクカードはfetchしたページのOGPタグを解析し、GM storageにキャッシュします。
  Link cards are built by fetching and parsing OGP tags from the linked page, cached via GM storage.
- 設定値はすべて `GM_setValue` / `GM_getValue` で永続化されます。
  All settings persist via `GM_setValue` / `GM_getValue`.

## 注意 / Notes

- 非公式のGoogle翻訳エンドポイントに依存しているため、Google側の仕様変更で翻訳機能が動作しなくなる可能性があります。
  Relies on an unofficial Google Translate endpoint and may break if Google changes its response format.
- `app.tweet.app` のDOM構造変更により、機能の一部またはすべてが動作しなくなる可能性があります。
  Features may break if `app.tweet.app` changes its DOM structure.
- Issue・PR等によるサポートは行っていません。
  No support is provided via issues or pull requests.

## License

MIT
