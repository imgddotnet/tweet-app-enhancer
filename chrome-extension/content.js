// Tweet.app Enhancer (Chrome extension content script) v2.3.0

(function () {
  'use strict';

  // ============================================================
  // GM_* 互換レイヤー (chrome.storage.local / background.js 経由の HTTP 取得)

  const __settingsCache = {};

  function GM_getValue(key, defaultValue) {
    return key in __settingsCache ? __settingsCache[key] : defaultValue;
  }

  function GM_setValue(key, value) {
    __settingsCache[key] = value;
    chrome.storage.local.set({ [key]: value });
  }

  function loadSettingsCache() {
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (all) => {
        Object.assign(__settingsCache, all);
        resolve();
      });
    });
  }

  // background.js 経由で取得する(ページのCSPやCORSの影響を受けない)。
  // responseType: 'blob' の場合は res.response に Blob を入れる(GIF取得用)。
  function GM_xmlhttpRequest(opts) {
    const wantBlob = opts.responseType === 'blob';
    const fail = (message) => {
      if (opts.onerror) opts.onerror(new Error(message));
    };
    try {
      chrome.runtime.sendMessage(
        { type: 'tt-fetch', url: opts.url, binary: wantBlob },
        (response) => {
          if (chrome.runtime.lastError) {
            fail(chrome.runtime.lastError.message);
            return;
          }
          if (!response || response.error) {
            fail(response?.error || 'no response');
            return;
          }
          const res = {
            status: response.status,
            responseText: response.text || '',
            responseHeaders: response.headers || '',
            finalUrl: response.finalUrl || opts.url,
          };
          if (wantBlob) {
            const binary = atob(response.base64 || '');
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            res.response = new Blob([bytes], { type: response.contentType || '' });
          }
          if (opts.onload) opts.onload(res);
        }
      );
    } catch (e) {
      fail(String(e));
    }
  }

  loadSettingsCache().then(runContentScript);

  function runContentScript() {
  // ============================================================
  // CONFIG
  const CONFIG = {
    avatarShape: {
      key: 'tweetapp_avatar_shape',
      default: 'circle',
    },
    composeTab: {
      enabledKey: 'tweetapp_compose_tab_enabled',
      enabledDefault: false,
    },
    timeDisplay: {
      enabledKey: 'tweetapp_time_enabled',
      enabledDefault: false,
    },
    timeFormat: {
      key: 'tweetapp_time_format',
      default: '(YYYY-MM-DD hh:mm:ss)',
    },
    customCss: {
      key: 'tweetapp_custom_css',
    },
    autogrow: {
      enabledKey: 'tweetapp_autogrow_enabled',
      enabledDefault: false,
    },
    font: {
      key: 'tweetapp_article_scale',
      default: 1,
      presets: [1, 1.10, 1.20, 1.25, 1.30, 1.50],
      labels: ['Default', '', '', '', '', ''],
      composerBasePx: 15,
    },
    media: {
      key: 'tweetapp_media_width_pct',
      default: 100,
      presets: [
        { pct: 100, label: 'Default' },
        { pct: 75, label: 'Medium' },
        { pct: 50, label: 'Small' },
      ],
    },
    linkCard: {
      enabledKey: 'tweetapp_linkcard_enabled',
      enabledDefault: false,
      className: 'ogp-link-card',
      cacheKey: 'tweetapp_ogp_cache_v2',
      cacheMaxEntries: 300,
      cacheTtlMs: 7 * 24 * 60 * 60 * 1000,
      fetchTimeoutMs: 15000,
    },
    composer: {
      visibleKey: 'tweetapp_composer_visible',
      visibleDefault: true,
      containerSelector: 'main div:has(textarea#public-tweet-input):not(:has(article)):not([role="dialog"] *), main div:has(textarea[name="compose-text"]):not(:has(article)):not([role="dialog"] *):not(:has(textarea[placeholder*="reply" i]))',
      textareaSelector: 'textarea#public-tweet-input, textarea#public-modal-tweet-input, textarea[name="compose-text"], textarea',
    },
    autoplay: {
      enabledKey: 'tweetapp_autoplay_enabled',
      enabledDefault: true,
    },
    replyPrefill: {
      enabledKey: 'tweetapp_reply_prefill_enabled',
      enabledDefault: false,
    },
    hideRepost: {
      enabledKey: 'tweetapp_hide_repost_enabled',
      enabledDefault: false,
    },
    hideGames: {
      enabledKey: 'tweetapp_hide_games_enabled',
      enabledDefault: false,
      selector: 'section[data-testid="todays-games-card"], section[aria-labelledby="feed-games-title"], button[data-testid="games-rollup-row"]',
    },
    gif: {
      enabledKey: 'tweetapp_gif_enabled',
      enabledDefault: false,
    },
    notificationToast: {
      enabledKey: 'tweetapp_notification_toast_enabled',
      enabledDefault: false,
      pollIntervalMs: 3000,
      displayMs: 4000,
      soundKey: 'tweetapp_notification_sound',
      soundDefault: 'chime',
      sounds: ['none', 'chime', 'drop', 'marimba', 'bell', 'pop', 'sparkle', 'ping'],
    },
    translate: {
      key: 'tweetapp_compose_translate_lang',
      default: 'en',
      noneValue: 'none',
      langs: [
        ['none', 'None (hide button)'],
        ['ja', '日本語'],
        ['en', 'English'],
        ['zh-CN', '中文(簡体)'],
        ['zh-TW', '中文(繁体)'],
        ['ko', '한국어'],
        ['es', 'Español'],
        ['fr', 'Français'],
        ['de', 'Deutsch'],
        ['it', 'Italiano'],
      ],
      composeSelector: 'textarea[placeholder*="happening" i], [contenteditable="true"][aria-label*="happening" i], [contenteditable="true"][aria-placeholder*="happening" i]',
    },
  };
  // ============================================================
  // Settings
  function collectMatching(root, selector) {
    const matches = root instanceof Element && root.matches?.(selector) ? [root] : [];
    return matches.concat(Array.from(root.querySelectorAll?.(selector) || []));
  }
  function createSetting(key, defaultValue, onChange) {
    return {
      get: () => GM_getValue(key, defaultValue),
      set: (value) => {
        GM_setValue(key, value);
        if (onChange) onChange(value);
      },
    };
  }
  let styleEl = null;
  const fontSizeSetting = createSetting(CONFIG.font.key, CONFIG.font.default, () => applyStyles());
  const mediaPctSetting = createSetting(CONFIG.media.key, CONFIG.media.default, () => applyStyles());
  const composerVisibleSetting = createSetting(CONFIG.composer.visibleKey, CONFIG.composer.visibleDefault, () => applyStyles());
  const linkCardEnabledSetting = createSetting(CONFIG.linkCard.enabledKey, CONFIG.linkCard.enabledDefault, (enabled) => {
    if (enabled) document.querySelectorAll('article').forEach(processArticle);
    else removeAllLinkCards();
  });
  const autoplayEnabledSetting = createSetting(CONFIG.autoplay.enabledKey, CONFIG.autoplay.enabledDefault, () => applyAutoplaySetting(document, true));
  const translateLangSetting = createSetting(CONFIG.translate.key, CONFIG.translate.default, () => refreshAllTranslateBtnLabels());
  const replyPrefillEnabledSetting = createSetting(CONFIG.replyPrefill.enabledKey, CONFIG.replyPrefill.enabledDefault, () => {});
  const gifEnabledSetting = createSetting(CONFIG.gif.enabledKey, CONFIG.gif.enabledDefault, () => refreshAllGifButtons());
  const autogrowEnabledSetting = createSetting(CONFIG.autogrow.enabledKey, CONFIG.autogrow.enabledDefault, () => {});
  const timeFormatSetting = createSetting(CONFIG.timeFormat.key, CONFIG.timeFormat.default, () => {});
  const timeEnabledSetting = createSetting(CONFIG.timeDisplay.enabledKey, CONFIG.timeDisplay.enabledDefault, () => {});
  const composeTabSetting = createSetting(CONFIG.composeTab.enabledKey, CONFIG.composeTab.enabledDefault, () => {});
  const avatarShapeSetting = createSetting(CONFIG.avatarShape.key, CONFIG.avatarShape.default, () => {});
  const hideRepostEnabledSetting = createSetting(CONFIG.hideRepost.enabledKey, CONFIG.hideRepost.enabledDefault, () => applyHideRepostFilter());
  const hideGamesEnabledSetting = createSetting(CONFIG.hideGames.enabledKey, CONFIG.hideGames.enabledDefault, () => applyStyles());
  const notificationToastEnabledSetting = createSetting(CONFIG.notificationToast.enabledKey, CONFIG.notificationToast.enabledDefault, () => {});
  const notificationSoundSetting = createSetting(CONFIG.notificationToast.soundKey, CONFIG.notificationToast.soundDefault, () => {});
  // ============================================================
  // 動画・GIF自動再生制御
  const userTouchedVideos = new WeakSet();
  function isTrackedVideo(node) {
    return node instanceof HTMLVideoElement && !!node.closest('article');
  }
  function markVideoAsUserTouched(event) {
    userTouchedVideos.add(event.currentTarget);
  }
  function bindVideoGestureListeners(video) {
    if (video.dataset.ttGestureBound) return;
    video.dataset.ttGestureBound = '1';
    ['pointerdown', 'mousedown', 'touchstart', 'click', 'keydown'].forEach((type) => {
      video.addEventListener(type, markVideoAsUserTouched, true);
    });
  }
  function stopVideo(video, force = false) {
    if (!(video instanceof HTMLVideoElement)) return;
    bindVideoGestureListeners(video);
    if (!force && userTouchedVideos.has(video)) return;
    video.autoplay = false;
    video.removeAttribute('autoplay');
    video.pause();
  }
  function startVideo(video) {
    if (!(video instanceof HTMLVideoElement)) return;
    bindVideoGestureListeners(video);
    video.autoplay = true;
    if (!video.hasAttribute('autoplay')) video.setAttribute('autoplay', '');
    video.muted = true;
    if (video.paused) video.play().catch(() => {});
  }
  function applyAutoplaySetting(root = document, force = false) {
    const enabled = autoplayEnabledSetting.get();
    const videos = collectMatching(root, 'article video');
    videos.forEach((video) => {
      if (enabled) startVideo(video);
      else stopVideo(video, force);
    });
  }
  document.addEventListener(
    'play',
    (event) => {
      const video = event.target;
      if (!isTrackedVideo(video)) return;
      if (autoplayEnabledSetting.get()) return;
      if (userTouchedVideos.has(video)) return;
      video.pause();
      video.autoplay = false;
      video.removeAttribute('autoplay');
    },
    true
  );
  // ============================================================
  // Tweet.app の赤エラーメッセージ要素を削除する処理
  function clearTweetAppErrorMessages(container) {
    const scope = container || document;
    const errorElements = Array.from(scope.querySelectorAll('div, p, span')).filter((el) => {
      return el.children.length === 0 && el.textContent.includes('GIFs cannot be combined');
    });
    errorElements.forEach((el) => {
      const target = el.closest('div.text-red-500, div[class*="red"], p[class*="red"]') || el;
      target.remove();
    });
  }
  // ============================================================
  // GIF 検索＆添付機能 (Tenor)
  //
  // Tenor:
  //   Tenor APIは終了しているため、tenor.comの検索ページに
  //   埋め込まれている store-cache を読み取る。
  //
  // 添付:
  //   検索結果のURLを投稿本文へ入れず、実GIFをBlob/Fileへ変換し、
  //   Tweet.app自身のファイル入力へ設定する。
  //
  // ============================================================
  const TENOR_BASE_URL = 'https://tenor.com';
  const TENOR_SEARCH_CACHE = new Map();
  const TENOR_SEARCH_CACHE_TTL = 5 * 60 * 1000;
  function gmRequest(options) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        ...options,
        onload: resolve,
        onerror: reject,
        ontimeout: () => reject(new Error('Request timeout')),
        onabort: () => reject(new Error('Request aborted')),
      });
    });
  }
  function normalizeTenorGifUrl(url) {
    if (!url) return '';
    let value = String(url).trim();
    if (/^https?:\/\/media\d*\.tenor\.com\//i.test(value)) {
      value = value.replace(
        /^https:\/\/media\d*\.tenor\.com\/m\//i,
        'https://media.tenor.com/'
      );
      value = value.replace(
        /^https:\/\/media\d*\.tenor\.com\/images\//i,
        'https://media.tenor.com/images/'
      );
      value = value.replace(
        /^https:\/\/media\d*\.tenor\.com\//i,
        'https://media.tenor.com/'
      );
    }
    return value;
  }
  function extractTenorMediaUrl(mediaFormats) {
    if (!mediaFormats || typeof mediaFormats !== 'object') return '';
    const candidates = [
      mediaFormats.gif,
      mediaFormats.mediumgif,
      mediaFormats.largegif,
      mediaFormats.tinygif,
      mediaFormats.nanogif,
      mediaFormats.gifpreview,
    ];
    for (const item of candidates) {
      if (typeof item === 'string') {
        const url = normalizeTenorGifUrl(item);
        if (/\.gif(?:[?#]|$)/i.test(url)) return url;
      }
      if (item && typeof item.url === 'string') {
        const url = normalizeTenorGifUrl(item.url);
        if (/\.gif(?:[?#]|$)/i.test(url)) return url;
      }
    }
    return '';
  }
  function convertTenorResult(item, index) {
    if (!item || typeof item !== 'object') return null;
    const mediaFormats =
      item.media_formats ||
      item.mediaFormats ||
      item.media ||
      {};
    const fullUrl =
      extractTenorMediaUrl(mediaFormats) ||
      normalizeTenorGifUrl(
        item.url ||
        item.gif_url ||
        item.gifUrl ||
        item.image_url ||
        item.imageUrl ||
        ''
      );
    if (!fullUrl) return null;
    const previewUrl =
      normalizeTenorGifUrl(
        mediaFormats.tinygif?.url ||
        mediaFormats.mediumgif?.url ||
        mediaFormats.gifpreview?.url ||
        mediaFormats.webp?.url ||
        mediaFormats.tinywebp?.url ||
        item.preview_url ||
        item.previewUrl ||
        fullUrl
      );
    const id =
      item.id != null
        ? String(item.id)
        : `tenor_${Date.now()}_${index}`;
    const title =
      item.content_description ||
      item.h1_title ||
      item.title ||
      item.name ||
      'Tenor GIF';
    return {
      id,
      provider: 'Tenor',
      title: String(title).slice(0, 200),
      previewUrl: previewUrl || fullUrl,
      fullUrl,
      sourceUrl: item.itemurl || item.url || '',
    };
  }
  function parseTenorStoreCache(html) {
    const match = html.match(
      /<script[^>]+id=["']store-cache["'][^>]*>([\s\S]*?)<\/script>/i
    );
    if (!match) {
      throw new Error('Tenor search data was not found');
    }
    let raw = match[1].trim();
    raw = raw
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');
    return JSON.parse(raw);
  }
  function getTenorSearchResults(store) {
    const searchStore = store?.universal?.search;
    if (!searchStore || typeof searchStore !== 'object') {
      return [];
    }
    const entries = Object.values(searchStore);
    for (const entry of entries) {
      if (Array.isArray(entry?.results)) {
        return entry.results;
      }
    }
    return [];
  }
  function buildTenorSearchUrl(query) {
    const q = String(query || '').trim();
    if (!q) {
      return `${TENOR_BASE_URL}/search/search-gifs`;
    }
    const slug = q
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => encodeURIComponent(part))
      .join('-');
    return `${TENOR_BASE_URL}/search/${slug}-gifs`;
  }
  function fetchTenorGifs(query, cb) {
    const q = String(query || '').trim();
    const cacheKey = q.toLowerCase();
    const cached = TENOR_SEARCH_CACHE.get(cacheKey);
    if (cached && Date.now() - cached.ts < TENOR_SEARCH_CACHE_TTL) {
      cb(null, cached.gifs);
      return;
    }
    const url = buildTenorSearchUrl(q);
    gmRequest({
      method: 'GET',
      url,
      timeout: 15000,
    })
      .then((res) => {
        if (res.status < 200 || res.status >= 300) {
          throw new Error(`Tenor HTTP ${res.status}`);
        }
        const store = parseTenorStoreCache(res.responseText);
        const rawResults = getTenorSearchResults(store);
        const gifs = rawResults
          .map(convertTenorResult)
          .filter(Boolean)
          .filter((item) => item.fullUrl);
        TENOR_SEARCH_CACHE.set(cacheKey, {
          ts: Date.now(),
          gifs,
        });
        cb(null, gifs);
      })
      .catch((err) => {
        console.error('[Tweet.app Enhancer] Tenor search failed:', err);
        cb(err, []);
      });
  }
  function findComposerFileInputs(composeEl) {
    const candidates = [];
    const scopes = [];
    let current = composeEl;
    while (current && current !== document.body) {
      if (current.matches?.('form, [role="dialog"], .fixed, main')) {
        scopes.push(current);
      }
      current = current.parentElement;
    }
    scopes.push(document);
    const seen = new Set();
    for (const scope of scopes) {
      const inputs = Array.from(
        scope.querySelectorAll?.('input[type="file"]') || []
      );
      for (const input of inputs) {
        if (seen.has(input)) continue;
        seen.add(input);
        if (input.disabled) continue;
        if (input.closest('article')) continue;
        const rect = input.getBoundingClientRect();
        const style = getComputedStyle(input);
        const visible =
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width >= 0 &&
          rect.height >= 0;
        const accept = String(input.getAttribute('accept') || '').toLowerCase();
        const supportsImage =
          !accept ||
          accept.includes('image/*') ||
          accept.includes('image/gif') ||
          accept.includes('.gif');
        if (!supportsImage) continue;
        candidates.push({
          input,
          score:
            (input.closest('form') ? 30 : 0) +
            (input.closest('[role="dialog"]') ? 20 : 0) +
            (input.closest('.fixed') ? 10 : 0) +
            (visible ? 10 : 0),
        });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates.map((item) => item.input);
  }
  function getComposerFileInput(composeEl) {
    const inputs = findComposerFileInputs(composeEl);
    if (!inputs.length) return null;
    return inputs[0];
  }
  function createGifFile(blob, provider) {
    let type = blob.type || 'image/gif';
    if (!/^image\/gif$/i.test(type)) {
      type = 'image/gif';
    }
    return new File(
      [blob],
      `${provider.toLowerCase()}_${Date.now()}.gif`,
      {
        type,
        lastModified: Date.now(),
      }
    );
  }
  function fetchGifBlob(url, retryUrl = '') {
    return gmRequest({
      method: 'GET',
      url,
      responseType: 'blob',
      timeout: 30000,
    }).then((res) => {
      if (res.status < 200 || res.status >= 300) {
        throw new Error(`HTTP ${res.status}`);
      }
      const blob = res.response;
      if (!(blob instanceof Blob)) {
        throw new Error('GIF response was not a Blob');
      }
      const contentType = String(
        res.responseHeaders?.match(/content-type:\s*([^\r\n;]+)/i)?.[1] || ''
      ).toLowerCase();
      const blobType = String(blob.type || '').toLowerCase();
      if (
        /image\/gif/i.test(blobType) ||
        /image\/gif/i.test(contentType)
      ) {
        return blob;
      }
      if (retryUrl && retryUrl !== url) {
        return fetchGifBlob(retryUrl);
      }
      throw new Error('The downloaded file is not a GIF');
    });
  }
  function buildTenorRetryUrl(url) {
    if (!url) return '';
    if (/^https:\/\/media\.tenor\.com\//i.test(url)) {
      return '';
    }
    if (/^https:\/\/media\d*\.tenor\.com\/m\//i.test(url)) {
      return url.replace(
        /^https:\/\/media\d*\.tenor\.com\/m\//i,
        'https://media.tenor.com/'
      );
    }
    if (/^https:\/\/media\d*\.tenor\.com\//i.test(url)) {
      return url.replace(
        /^https:\/\/media\d*\.tenor\.com\//i,
        'https://media.tenor.com/'
      );
    }
    return '';
  }
  function setFileInputFile(input, file) {
    if (!input) {
      throw new Error('Tweet.app file input was not found');
    }
    const dt = new DataTransfer();
    dt.items.add(file);
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'files'
    );
    if (descriptor?.set) {
      descriptor.set.call(input, dt.files);
    } else {
      input.files = dt.files;
    }
    input.dispatchEvent(new Event('input', {
      bubbles: true,
      composed: true,
    }));
    input.dispatchEvent(new Event('change', {
      bubbles: true,
      composed: true,
    }));
  }
  function attachGifToComposer(composeEl, gifItem) {
    if (!gifItem?.fullUrl) {
      alert('GIF URL is unavailable');
      return;
    }
    const input = getComposerFileInput(composeEl);
    if (!input) {
      alert('Could not find the GIF upload field in Tweet.app');
      return;
    }
    // ポップアップのみ表示し、通知音は鳴らさない
    showToastMessage('Downloading Tenor GIF...', false);
    const normalizedUrl = normalizeTenorGifUrl(gifItem.fullUrl);
    const retryUrl = buildTenorRetryUrl(gifItem.fullUrl);
    clearTweetAppErrorMessages(
      composeEl.closest('form, [role="dialog"], .fixed') || document
    );
    fetchGifBlob(normalizedUrl, retryUrl)
      .then((blob) => {
        const file = createGifFile(blob, 'Tenor');
        /*
         * 重要:
         * 以前は document 内の全 input[type=file] に同じファイルを
         * 設定していた。
         *
         * Tweet.appでは複数のファイル入力が存在するため、これを行うと
         * GIFが複数回処理され、「GIFs cannot be combined」になることがある。
         *
         * 現在は対象の投稿欄に属する入力だけを1個処理する。
         */
        setFileInputFile(input, file);
        const container =
          composeEl.closest('form, [role="dialog"], .fixed') || document;
        setTimeout(() => clearTweetAppErrorMessages(container), 100);
        setTimeout(() => clearTweetAppErrorMessages(container), 500);
        setTimeout(() => clearTweetAppErrorMessages(container), 1000);
      })
      .catch((err) => {
        console.error('[Tweet.app Enhancer] GIF attachment failed:', err);
        alert(`Failed to attach GIF.\n\n${err?.message || 'Unknown error'}`);
      });
  }
  function updateGifBtnVisibility(btn) {
    btn.style.display = gifEnabledSetting.get() ? '' : 'none';
  }
  function refreshAllGifButtons() {
    document.querySelectorAll('.tt-gif-btn').forEach(updateGifBtnVisibility);
  }
  function openGifPicker(composeEl) {
    if (document.getElementById('tt-gif-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'tt-gif-modal';
    modal.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 100000;
      background: rgba(0,0,0,0.65);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      box-sizing: border-box;
    `;
    const card = document.createElement('div');
    card.style.cssText = `
      width: 100%;
      max-width: 500px;
      height: min(620px, calc(100vh - 32px));
      background: var(--color-tl-app-bg, #15202b);
      border-radius: 16px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    `;
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 12px 16px;
      display: flex;
      gap: 8px;
      align-items: center;
      border-bottom: 1px solid var(--color-tl-app-border, #38444d);
    `;
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Search Tenor GIFs...';
    input.style.cssText = `
      flex: 1;
      min-width: 0;
      padding: 8px 14px;
      border-radius: 9999px;
      border: 1px solid var(--color-tl-app-border, #38444d);
      font-size: 14px;
      outline: none;
      background: transparent;
      color: inherit;
    `;
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = `
      background: none;
      border: none;
      font-size: 18px;
      cursor: pointer;
      padding: 4px 8px;
      color: inherit;
    `;
    closeBtn.onclick = () => modal.remove();
    header.appendChild(input);
    header.appendChild(closeBtn);
    const grid = document.createElement('div');
    grid.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
      align-content: start;
    `;
    const footer = document.createElement('div');
    footer.style.cssText = `
      padding: 7px 12px;
      border-top: 1px solid var(--color-tl-app-border, #38444d);
      color: #8899a6;
      font-size: 10px;
      text-align: center;
    `;
    footer.textContent =
      'Powered by Tenor · GIFs are downloaded and attached as media files.';
    card.appendChild(header);
    card.appendChild(grid);
    card.appendChild(footer);
    modal.appendChild(card);
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
    let debounceTimer = null;
    let requestSerial = 0;
    function renderLoading() {
      grid.innerHTML = `
        <div style="
          grid-column:span 2;
          text-align:center;
          padding:32px;
          color:#8899a6;
        ">
          Loading GIFs...
        </div>
      `;
    }
    function renderEmpty() {
      grid.innerHTML = `
        <div style="
          grid-column:span 2;
          text-align:center;
          padding:24px;
          color:#8899a6;
        ">
          No GIFs found
        </div>
      `;
    }
    function renderError(err) {
      grid.innerHTML = `
        <div style="
          grid-column:span 2;
          text-align:center;
          padding:24px;
          color:#e0245e;
          line-height:1.5;
          white-space:pre-line;
        ">
          GIF search failed.<br>
          <small>${escapeHtml(String(err?.message || err || 'Unknown error'))}</small>
        </div>
      `;
    }
    function loadGifs(query = '') {
      const serial = ++requestSerial;
      renderLoading();
      fetchTenorGifs(query, (err, gifs) => {
        if (serial !== requestSerial) return;
        grid.innerHTML = '';
        if (err) {
          renderError(err);
          return;
        }
        if (!gifs || gifs.length === 0) {
          renderEmpty();
          return;
        }
        gifs.forEach((item) => {
          const cell = document.createElement('div');
          cell.style.cssText = 'min-width: 0;';
          const img = document.createElement('img');
          img.src = item.previewUrl;
          img.loading = 'lazy';
          img.alt = item.title || 'Tenor GIF';
          img.style.cssText = `
            width: 100%;
            height: 130px;
            object-fit: cover;
            border-radius: 8px;
            cursor: pointer;
            transition: transform 0.1s, opacity 0.1s;
            background: rgba(128,128,128,0.1);
          `;
          img.addEventListener('mouseenter', () => {
            img.style.transform = 'scale(1.03)';
          });
          img.addEventListener('mouseleave', () => {
            img.style.transform = 'scale(1)';
          });
          img.addEventListener('error', () => {
            img.style.opacity = '0.3';
          });
          img.addEventListener('click', () => {
            modal.remove();
            attachGifToComposer(composeEl, item);
          });
          cell.appendChild(img);
          grid.appendChild(cell);
        });
      });
    }
    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadGifs(input.value);
      }, 350);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        modal.remove();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(debounceTimer);
        loadGifs(input.value);
      }
    });
    loadGifs();
    setTimeout(() => {
      input.focus();
    }, 50);
  }
  // ============================================================
  // CSS定義
  const SETTINGS_PANEL_CSS = `
    .tt-toggle-switch {
      width: 44px;
      height: 24px;
      border-radius: 9999px;
      background: #cbd5e1;
      position: relative;
      border: none;
      padding: 0;
      cursor: pointer;
      flex-shrink: 0;
      transition: background 0.15s;
    }
    .tt-toggle-switch[aria-checked="true"] {
      background: #0ea5e9;
    }
    .tt-toggle-thumb {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #fff;
      transition: transform 0.15s;
    }
    .tt-toggle-switch[aria-checked="true"] .tt-toggle-thumb {
      transform: translateX(20px);
    }
    .tt-settings-value-btn {
      font-size: 13px;
      font-weight: 700;
      padding: 6px 12px;
      border-radius: 9999px;
      border: 1px solid var(--color-tl-app-border, #d1d5db);
      background: var(--color-tl-app-card, transparent);
      color: var(--color-tl-app-text-muted, #64748b);
      cursor: pointer;
      white-space: nowrap;
    }
    select.tt-settings-value-btn {
      -webkit-appearance: none;
      appearance: none;
      padding-right: 24px;
      background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'><path d='M6 9l6 6 6-6'/></svg>");
      background-repeat: no-repeat;
      background-position: right 6px center;
      background-size: 14px;
      max-width: 160px;
      text-overflow: ellipsis;
    }
  `;
  const NOTIFICATION_TOAST_CSS = `
    .tt-notification-toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(12px);
      background: #1d9bf0;
      color: #fff;
      padding: 12px 24px;
      border-radius: 9999px;
      font-size: 15px;
      font-weight: 400;
      box-shadow: 0 0 12px rgba(0,0,0,0.15);
      z-index: 10050;
      opacity: 0;
      transition: opacity 0.2s ease, transform 0.2s ease;
      pointer-events: none;
      white-space: nowrap;
      max-width: calc(100vw - 32px);
    }
    .tt-notification-toast.tt-toast-show {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  `;
  const TRANSLATE_BTN_CSS = `
    .tt-compose-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
      color: rgb(101,119,134);
      font-size: 13px;
      margin-right: 8px;
      user-select: none;
      width: fit-content;
      padding: 4px 0;
    }
    .tt-compose-btn:hover {
      color: #1da1f2;
    }
    .tt-gif-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
      color: #1da1f2;
      font-size: 12px;
      font-weight: bold;
      border: 1px solid #1da1f2;
      border-radius: 4px;
      padding: 1px 5px;
      margin-right: 8px;
      user-select: none;
    }
    .tt-gif-btn:hover {
      background: rgba(29, 161, 242, 0.1);
    }
    .tt-compose-result {
      margin-top: 8px;
      padding: 8px 10px;
      background: rgba(23,191,99,0.08);
      border-left: 3px solid #17bf63;
      border-radius: 4px;
      font-size: 14px;
      white-space: pre-wrap;
      cursor: pointer;
    }
  `;
  // ============================================================
  // スタイル適用
  function applyStyles() {
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'tweetapp-appearance-style';
      if (document.documentElement) {
        document.documentElement.appendChild(styleEl);
      }
    }
    const scale = fontSizeSetting.get();
    const mediaPct = mediaPctSetting.get();
    const composerVisible = composerVisibleSetting.get();
    const hideGames = hideGamesEnabledSetting.get();
    const onSettingsPage = location.pathname.startsWith('/settings');
    styleEl.textContent = `
      article {
        zoom: ${scale};
      }
      ${onSettingsPage ? '' : `
      div.rounded-2xl.overflow-hidden,
      div.${CONFIG.linkCard.className} {
        width: ${mediaPct}% !important;
        margin-left: auto !important;
        margin-right: auto !important;
      }
      article img[alt="Attached media"]:not(div.rounded-2xl.overflow-hidden img) {
        display: block !important;
        width: ${mediaPct}% !important;
        margin-left: auto !important;
        margin-right: auto !important;
      }`}
      ${composerVisible ? '' : `${CONFIG.composer.containerSelector} {
        display: none !important;
      }`}
      ${hideGames ? `${CONFIG.hideGames.selector} {
        display: none !important;
      }` : ''}
      ${TRANSLATE_BTN_CSS}
      ${SETTINGS_PANEL_CSS}
      ${NOTIFICATION_TOAST_CSS}
    `;
    applyFontSizeToComposers();
  }
  function setFontStyle(el, fontSizePx) {
    el.style.setProperty('font-size', `${fontSizePx}px`, 'important');
    el.style.setProperty('line-height', '1.5', 'important');
  }
  function applyFontSizeToComposers(root = document) {
    const scaledPx = Math.round(
      CONFIG.font.composerBasePx * fontSizeSetting.get()
    );
    root.querySelectorAll?.(
      CONFIG.composer.textareaSelector
    ).forEach((textarea) => {
      if (textarea.closest('#tweetapp-enhancements-overlay')) return;
      const fontSizePx = textarea.closest('article')
        ? CONFIG.font.composerBasePx
        : scaledPx;
      setFontStyle(textarea, fontSizePx);
      textarea.parentElement?.querySelectorAll('*').forEach((el) => {
        setFontStyle(el, fontSizePx);
      });
    });
  }
  function clearOgpCache() {
    GM_setValue(CONFIG.linkCard.cacheKey, {});
    ogpCache.clear();
    ogpFail.clear();
    alert('Link card cache cleared');
  }
  // ============================================================
  // /settings ページへの設定パネル埋め込み
  function createSliderControl({
    min,
    max,
    step,
    getValue,
    setValue,
    format,
  }) {
    const wrap = document.createElement('div');
    wrap.style.cssText =
      'display:flex;align-items:center;gap:10px;width:100%;';
    wrap.dataset.wide = '1';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.style.cssText = 'flex:1;cursor:pointer;';
    const label = document.createElement('span');
    label.style.cssText =
      'min-width:48px;text-align:right;font-size:13px;font-variant-numeric:tabular-nums;';
    function render() {
      const v = getValue();
      input.value = String(v);
      label.textContent = format(v);
    }
    input.addEventListener('input', () => {
      label.textContent = format(parseInt(input.value, 10));
    });
    input.addEventListener('change', () => {
      setValue(parseInt(input.value, 10));
      render();
    });
    wrap.appendChild(input);
    wrap.appendChild(label);
    render();
    return {
      el: wrap,
      render,
    };
  }
  function createSettingsRow(title, description, controlEl) {
    const wide = controlEl.dataset.wide === '1';
    const row = document.createElement('div');
    row.className = wide
      ? 'flex flex-col gap-3 px-4 py-3.5'
      : 'flex items-center justify-between gap-3 px-4 py-3.5';
    const textWrap = document.createElement('div');
    textWrap.className = wide
      ? 'flex flex-col min-w-0'
      : 'flex flex-col min-w-0 flex-1';
    const titleEl = document.createElement('span');
    titleEl.className = 'text-[13px] font-bold text-tl-app-text';
    titleEl.textContent = title;
    textWrap.appendChild(titleEl);
    if (description) {
      const descEl = document.createElement('span');
      descEl.className = wide
        ? 'text-[11px] text-tl-app-text-muted leading-relaxed'
        : 'text-[11px] text-tl-app-text-muted truncate';
      descEl.textContent = description;
      textWrap.appendChild(descEl);
    }
    if (wide) {
      controlEl.style.width = '100%';
    }
    row.appendChild(textWrap);
    row.appendChild(controlEl);
    return row;
  }
  function createToggleControl(setting, labelOn, labelOff) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tt-toggle-switch';
    btn.setAttribute('role', 'switch');
    const thumb = document.createElement('span');
    thumb.className = 'tt-toggle-thumb';
    btn.appendChild(thumb);
    function render() {
      const checked = setting.get();
      btn.setAttribute('aria-checked', String(checked));
      btn.setAttribute('aria-label', checked ? labelOn : labelOff);
    }
    render();
    btn.addEventListener('click', () => {
      setting.set(!setting.get());
      render();
    });
    return {
      el: btn,
      render,
    };
  }
  function createSelectControl(options, getValue, setValue) {
    const select = document.createElement('select');
    select.className = 'tt-settings-value-btn';
    options.forEach(({ value, label }) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      select.appendChild(opt);
    });
    function render() {
      select.value = getValue();
    }
    render();
    select.addEventListener('change', () => {
      setValue(select.value);
      render();
    });
    return {
      el: select,
      render,
    };
  }
  const SITE_BTN_CLASS =
    'px-3.5 py-2 rounded-full text-xs font-bold border border-tl-app-border text-tl-app-text hover:bg-tl-app-surface transition-all cursor-pointer';
  function applyCustomCss() {
    let styleTag = document.getElementById('tweetapp-custom-css');
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'tweetapp-custom-css';
      (document.head || document.documentElement).appendChild(styleTag);
    }
    styleTag.textContent = GM_getValue(CONFIG.customCss.key, '');
  }
  const AVATAR_SHAPE_CSS = {
    circle: '',
    rounded:
      'img[alt$="avatar"], div.relative.inline-flex.shrink-0.isolate > button img[alt$="avatar"], div.relative.inline-flex.shrink-0.isolate > img[alt$="avatar"], div[role="form"] img[alt$="avatar"], button[aria-label="Open profile menu"] img[alt$="avatar"] { border-radius: 12px !important; }' +
      'div.relative.inline-flex.shrink-0.isolate > button, button[aria-label="Open profile menu"] { border-radius: 12px !important; }',
    square:
      'img[alt$="avatar"], div.relative.inline-flex.shrink-0.isolate > button img[alt$="avatar"], div.relative.inline-flex.shrink-0.isolate > img[alt$="avatar"], div[role="form"] img[alt$="avatar"], button[aria-label="Open profile menu"] img[alt$="avatar"] { border-radius: 0 !important; }' +
      'div.relative.inline-flex.shrink-0.isolate > button, button[aria-label="Open profile menu"] { border-radius: 0 !important; }',
  };
  function applyAvatarShape() {
    let styleTag = document.getElementById('tweetapp-avatar-shape');
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'tweetapp-avatar-shape';
      (document.head || document.documentElement).appendChild(styleTag);
    }
    styleTag.textContent = AVATAR_SHAPE_CSS[avatarShapeSetting.get()] || '';
  }
  const SETTINGS_ORDER = [
    'Article & Compose zoom',
    'Avatar shape',
    'Content width',
    'Time stamp',
    'Time stamp format',
    'Hide reposts',
    'Hide games',
    'Video/GIF autoplay',
    'Link card previews',
    'Link card cache',
    'Always-visible composer',
    'Auto-grow textarea',
    'Reply @handle prefill',
    'Translate target language',
    'Notification popup',
    'Notification sound',
    '__experimental__',
    'GIF button',
    'Compose in new tab',
    'Custom CSS',
  ];
  function arrangeSettingsCard(card) {
    const rowsByTitle = new Map();
    Array.from(card.children).forEach((row) => {
      const title = row.querySelector('span.font-bold');
      if (title) {
        rowsByTitle.set(title.textContent.trim(), row);
      }
    });
    card.innerHTML = '';
    SETTINGS_ORDER.forEach((key) => {
      if (key === '__experimental__') {
        const heading = document.createElement('div');
        heading.textContent = 'Experimental';
        heading.style.cssText =
          'padding:12px 16px 4px;font-size:12px;font-weight:700;color:var(--color-tl-app-text-muted);';
        card.appendChild(heading);
        return;
      }
      const row = rowsByTitle.get(key);
      if (row) {
        card.appendChild(row);
      }
    });
  }
  function buildSettingsSection() {
    const section = document.createElement('div');
    section.id = 'tweetapp-enhancements-section';
    const titleBlock = document.createElement('div');
    const h4 = document.createElement('h4');
    h4.className = 'text-sm font-extrabold text-tl-app-text';
    h4.textContent = 'Tweet.app Enhancements';
    const p = document.createElement('p');
    p.className = 'text-[11px] text-tl-app-text-muted mt-0.5 leading-relaxed';
    p.textContent = 'Settings added by the userscript.';
    titleBlock.appendChild(h4);
    titleBlock.appendChild(p);
    const card = document.createElement('div');
    card.className =
      'rounded-2xl border border-tl-app-border overflow-hidden divide-y divide-tl-app-border';
    const fontSizeCtrl = createSliderControl({
      min: 50,
      max: 200,
      step: 5,
      getValue: () => Math.round(fontSizeSetting.get() * 100),
      setValue: (v) => fontSizeSetting.set(v / 100),
      format: (v) => `${v}%`,
    });
    card.appendChild(
      createSettingsRow(
        'Article & Compose zoom',
        'Zoom level for tweet articles and compose box (5% steps)',
        fontSizeCtrl.el
      )
    );
    const mediaWidthCtrl = createSliderControl({
      min: 50,
      max: 100,
      step: 5,
      getValue: () => mediaPctSetting.get(),
      setValue: (v) => mediaPctSetting.set(v),
      format: (v) => `${v}%`,
    });
    card.appendChild(
      createSettingsRow(
        'Content width',
        'Width of media and content area (5% steps)',
        mediaWidthCtrl.el
      )
    );
    const replyPrefillToggle = createToggleControl(
      replyPrefillEnabledSetting,
      'ON',
      'OFF'
    );
    card.appendChild(
      createSettingsRow(
        'Reply @handle prefill',
        'Prefill @handle when replying inline to a tweet',
        replyPrefillToggle.el
      )
    );
    const translateCtrl = createSelectControl(
      CONFIG.translate.langs.map(([code, label]) => ({
        value: code,
        label,
      })),
      () => translateLangSetting.get(),
      (v) => translateLangSetting.set(v)
    );
    card.appendChild(
      createSettingsRow(
        'Translate target language',
        'Language used when translating your draft before posting',
        translateCtrl.el
      )
    );
    const composerToggle = createToggleControl(
      composerVisibleSetting,
      'Shown',
      'Hidden'
    );
    card.appendChild(
      createSettingsRow(
        'Always-visible composer',
        'Show the tweet box at the top of the feed',
        composerToggle.el
      )
    );
    const autogrowToggle = createToggleControl(
      autogrowEnabledSetting,
      'ON',
      'OFF'
    );
    card.appendChild(
      createSettingsRow(
        'Auto-grow textarea',
        'Automatically expand text input area when typing multiple lines',
        autogrowToggle.el
      )
    );
    const hideRepostToggle = createToggleControl(
      hideRepostEnabledSetting,
      'ON',
      'OFF'
    );
    card.appendChild(
      createSettingsRow(
        'Hide reposts',
        'Hide articles marked as reposted',
        hideRepostToggle.el
      )
    );
    const hideGamesToggle = createToggleControl(
      hideGamesEnabledSetting,
      'ON',
      'OFF'
    );
    card.appendChild(
      createSettingsRow(
        'Hide games',
        'Hide game cards (e.g. TWIRDLE) in the timeline',
        hideGamesToggle.el
      )
    );
    const autoplayToggle = createToggleControl(
      autoplayEnabledSetting,
      'ON',
      'OFF'
    );
    card.appendChild(
      createSettingsRow(
        'Video/GIF autoplay',
        'Automatically play videos and GIFs while scrolling',
        autoplayToggle.el
      )
    );
    const notificationToastToggle = createToggleControl(
      notificationToastEnabledSetting,
      'ON',
      'OFF'
    );
    card.appendChild(
      createSettingsRow(
        'Notification popup',
        'Show a popup when your notification count increases',
        notificationToastToggle.el
      )
    );
    const notificationSoundCtrl = createSelectControl(
      CONFIG.notificationToast.sounds.map((s) => ({
        value: s,
        label: s.charAt(0).toUpperCase() + s.slice(1),
      })),
      () => notificationSoundSetting.get(),
      (v) => {
        notificationSoundSetting.set(v);
        playNotificationSound();
      }
    );
    const demoSoundBtn = document.createElement('button');
    demoSoundBtn.type = 'button';
    demoSoundBtn.className = 'tt-settings-value-btn';
    demoSoundBtn.textContent = 'Play';
    demoSoundBtn.addEventListener('click', playNotificationSound);
    const soundControlWrapper = document.createElement('div');
    soundControlWrapper.style.cssText =
      'display:flex;gap:8px;align-items:center;';
    soundControlWrapper.appendChild(notificationSoundCtrl.el);
    soundControlWrapper.appendChild(demoSoundBtn);
    card.appendChild(
      createSettingsRow(
        'Notification sound',
        'Sound to play with the notification popup',
        soundControlWrapper
      )
    );
    const linkCardToggle = createToggleControl(
      linkCardEnabledSetting,
      'ON',
      'OFF'
    );
    card.appendChild(
      createSettingsRow(
        'Link card previews',
        'Show OGP preview cards for links in tweets',
        linkCardToggle.el
      )
    );
    const clearCacheBtn = document.createElement('button');
    clearCacheBtn.type = 'button';
    clearCacheBtn.className = 'tt-settings-value-btn';
    clearCacheBtn.textContent = 'Clear';
    clearCacheBtn.addEventListener('click', clearOgpCache);
    card.appendChild(
      createSettingsRow(
        'Link card cache',
        'Clear cached link preview data',
        clearCacheBtn
      )
    );
    const gifToggle = createToggleControl(gifEnabledSetting, 'ON', 'OFF');
    card.appendChild(
      createSettingsRow(
        'GIF button',
        'Show the Tenor GIF search button in the compose box',
        gifToggle.el
      )
    );
    const composeTabToggle = createToggleControl(
      composeTabSetting,
      'ON',
      'OFF'
    );
    card.appendChild(
      createSettingsRow(
        'Compose in new tab',
        'Open the tweet box in a new tab; closes after posting',
        composeTabToggle.el
      )
    );
    const timeToggle = createToggleControl(timeEnabledSetting, 'ON', 'OFF');
    card.appendChild(
      createSettingsRow(
        'Time stamp',
        'Show absolute time after relative times',
        timeToggle.el
      )
    );
    const timeInput = document.createElement('input');
    timeInput.type = 'text';
    timeInput.value = timeFormatSetting.get();
    timeInput.placeholder = '(YYYY-MM-DD hh:mm:ss)';
    timeInput.spellcheck = false;
    timeInput.style.cssText =
      'width:100%;box-sizing:border-box;padding:8px;font-family:monospace;font-size:12px;border-radius:8px;';
    const timeApplyBtn = document.createElement('button');
    timeApplyBtn.type = 'button';
    timeApplyBtn.textContent = 'Apply';
    timeApplyBtn.className = SITE_BTN_CLASS;
    timeApplyBtn.style.cssText = 'align-self:flex-end;';
    timeApplyBtn.addEventListener('click', () => {
      timeFormatSetting.set(timeInput.value.trim());
      document
        .querySelectorAll('.tt-abs-time')
        .forEach((el) => el.remove());
      processAbsoluteTimes();
    });
    const timeWrap = document.createElement('div');
    timeWrap.style.cssText =
      'display:flex;flex-direction:column;gap:8px;width:100%;';
    timeWrap.dataset.wide = '1';
    timeWrap.appendChild(timeInput);
    timeWrap.appendChild(timeApplyBtn);
    card.appendChild(
      createSettingsRow(
        'Time stamp format',
        'Format incl. brackets, e.g. 3h (2026-10-14 17:00:00). Empty = off',
        timeWrap
      )
    );
    const avatarShapeCtrl = createSelectControl(
      [
        { value: 'circle', label: 'Circle (default)' },
        { value: 'rounded', label: 'Rounded square' },
        { value: 'square', label: 'Square' },
      ],
      () => avatarShapeSetting.get(),
      (v) => {
        avatarShapeSetting.set(v);
        applyAvatarShape();
      }
    );
    card.appendChild(
      createSettingsRow(
        'Avatar shape',
        'Shape of profile avatars',
        avatarShapeCtrl.el
      )
    );
    const customCssArea = document.createElement('textarea');
    customCssArea.className = 'tt-custom-css-input';
    customCssArea.value = GM_getValue(CONFIG.customCss.key, '');
    customCssArea.placeholder = '/* 例: article { border-radius: 0; } */';
    customCssArea.spellcheck = false;
    customCssArea.style.cssText =
      'width:100%;min-height:120px;box-sizing:border-box;padding:8px;font-family:monospace;font-size:12px;border-radius:8px;resize:vertical;';
    const applyCssBtn = document.createElement('button');
    applyCssBtn.type = 'button';
    applyCssBtn.textContent = 'Apply';
    applyCssBtn.className = SITE_BTN_CLASS;
    applyCssBtn.style.cssText = 'align-self:flex-end;';
    applyCssBtn.addEventListener('click', () => {
      GM_setValue(CONFIG.customCss.key, customCssArea.value);
      applyCustomCss();
    });
    const cssWrap = document.createElement('div');
    cssWrap.style.cssText =
      'display:flex;flex-direction:column;gap:8px;width:100%;';
    cssWrap.dataset.wide = '1';
    cssWrap.appendChild(customCssArea);
    cssWrap.appendChild(applyCssBtn);
    card.appendChild(
      createSettingsRow(
        'Custom CSS',
        'Extra CSS applied to tweet.app (press Apply to save)',
        cssWrap
      )
    );
    section.appendChild(titleBlock);
    arrangeSettingsCard(card);
    section.appendChild(card);
    return section;
  }
  // ============================================================
  // ナビ内メニュー
  function openEnhancerPanel() {
    if (document.getElementById('tweetapp-enhancements-overlay')) {
      return;
    }
    const overlay = document.createElement('div');
    overlay.id = 'tweetapp-enhancements-overlay';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.45);display:flex;align-items:flex-start;justify-content:center;padding:24px 12px;box-sizing:border-box;overflow-y:auto;';
    const panel = document.createElement('div');
    panel.style.cssText =
      'width:100%;max-width:560px;background:var(--color-tl-app-bg, #fff);border-radius:16px;padding:16px;box-sizing:border-box;position:relative;';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Close';
    closeBtn.className = SITE_BTN_CLASS;
    closeBtn.style.cssText = 'flex-shrink:0;';
    closeBtn.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });
    const section = buildSettingsSection();
    const titleBlock = section.firstElementChild;
    const header = document.createElement('div');
    header.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;';
    section.insertBefore(header, titleBlock);
    const versionLine = document.createElement('p');
    versionLine.style.cssText =
      'font-size:11px;color:var(--color-tl-app-text-muted);margin:0 0 12px;';
    const storedVersion = GM_getValue(SITE_VERSION_KEY, '');
    versionLine.textContent =
      'tweet.app ' +
      (storedVersion ||
        'version: not recorded yet (open tweet.app Settings on PC once)');
    section.insertBefore(versionLine, section.children[1] || null);
    header.appendChild(titleBlock);
    header.appendChild(closeBtn);
    panel.appendChild(section);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  }
  function findMenuNav() {
    const navs = Array.from(document.querySelectorAll('nav')).filter((n) =>
      n.querySelector('button')
    );
    const settingsNav = navs.find((n) =>
      Array.from(n.querySelectorAll('button')).some((b) =>
        /^(Your account|Security|Display|Followed hashtags|Muted accounts)/.test(
          b.textContent.trim()
        )
      )
    );
    return (
      settingsNav ||
      navs.find((n) => n.offsetParent !== null) ||
      null
    );
  }
  function findInviteButton() {
    return (
      Array.from(document.querySelectorAll('button')).find((b) =>
        b.textContent.trim().startsWith('Invite friends')
      ) || null
    );
  }
  function injectNavMenu() {
    let anchor = findInviteButton();
    if (!anchor) {
      const nav = findMenuNav();
      if (!nav) return;
      const buttons = nav.querySelectorAll('button');
      anchor = buttons[buttons.length - 1] || null;
      if (!anchor) return;
    }
    const existing = document.getElementById('tweetapp-nav-menu');
    if (existing) {
      if (existing.previousElementSibling === anchor) {
        return;
      }
      existing.remove();
    }
    const item = anchor.cloneNode(true);
    item.id = 'tweetapp-nav-menu';
    const icon = item.querySelector('svg');
    if (icon) {
      icon.setAttribute('class', 'lucide lucide-puzzle shrink-0');
      icon.setAttribute('style', 'color:#1da1f2;');
      icon.innerHTML =
        '<path d="M4 8h4a2 2 0 1 1 4 0h4v4a2 2 0 1 1 0 4v4H4z" fill="#1da1f2" stroke="#1da1f2"></path>';
    }
    const texts = item.querySelectorAll('span.flex.flex-col > span');
    if (texts[0]) {
      texts[0].textContent = 'Enhancer';
    }
    if (texts[1]) {
      texts[1].textContent = 'Tweet.app Enhancer settings';
    }
    item.addEventListener('click', openEnhancerPanel);
    anchor.insertAdjacentElement('afterend', item);
  }
  // ============================================================
  // 通知バッジ増加のポップアップ通知
  let lastNotificationCount = null;
  let audioCtx = null;
  let audioInitAttempted = false;
  function ensureAudioCtx() {
    if (!audioCtx && !audioInitAttempted) {
      audioInitAttempted = true;
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        return null;
      }
    }
    if (!audioCtx) return null;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }
  if (document.readyState !== 'loading') {
    setTimeout(() => {
      document.addEventListener('click', ensureAudioCtx, {
        once: true,
        capture: true,
      });
      document.addEventListener('keydown', ensureAudioCtx, {
        once: true,
        capture: true,
      });
    }, 100);
  } else {
    document.addEventListener('click', ensureAudioCtx, {
      once: true,
      capture: true,
    });
    document.addEventListener('keydown', ensureAudioCtx, {
      once: true,
      capture: true,
    });
  }
  function playTone(ctx, freq, startTime, duration, gain = 0.35) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.connect(env);
    env.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);
    env.gain.setValueAtTime(0, startTime);
    env.gain.linearRampToValueAtTime(gain, startTime + 0.01);
    env.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
  }
  function playMarimbaNote(ctx, freq, startTime, gain = 0.28) {
    [1, 4, 9].forEach((harmonic, i) => {
      const g = gain / (i * 0.4 + 1);
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.connect(env);
      env.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * harmonic, startTime);
      env.gain.setValueAtTime(0, startTime);
      env.gain.linearRampToValueAtTime(g, startTime + 0.004);
      env.gain.exponentialRampToValueAtTime(
        0.001,
        startTime + 0.25 / harmonic
      );
      osc.start(startTime);
      osc.stop(startTime + 0.4);
    });
  }
  function playBellNote(ctx, freq, startTime, gain = 0.22) {
    [1, 3, 6].forEach((ratio, i) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.connect(env);
      env.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * ratio, startTime);
      const g = gain / (i * 0.5 + 1);
      env.gain.setValueAtTime(0, startTime);
      env.gain.linearRampToValueAtTime(g, startTime + 0.004);
      env.gain.exponentialRampToValueAtTime(
        0.001,
        startTime + 0.6 - i * 0.12
      );
      osc.start(startTime);
      osc.stop(startTime + 0.75);
    });
  }
  function playSweepNote(
    ctx,
    fromFreq,
    toFreq,
    startTime,
    duration,
    gain = 0.25,
    type = 'sine'
  ) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(fromFreq, startTime);
    osc.frequency.exponentialRampToValueAtTime(
      toFreq,
      startTime + duration * 0.5
    );
    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.exponentialRampToValueAtTime(gain, startTime + 0.01);
    env.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(env);
    env.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }
  const SOUND_PLAYERS = {
    none: () => {},
    chime: () => {
      const ctx = ensureAudioCtx();
      if (!ctx) return;
      const t = ctx.currentTime;
      [261.63, 329.63, 392.0].forEach((freq, i) =>
        playTone(ctx, freq, t + i * 0.12, 0.35)
      );
    },
    drop: () => {
      const ctx = ensureAudioCtx();
      if (!ctx) return;
      playTone(ctx, 988, ctx.currentTime, 0.15, 0.25);
    },
    marimba: () => {
      const ctx = ensureAudioCtx();
      if (!ctx) return;
      const t = ctx.currentTime;
      playMarimbaNote(ctx, 392.0, t);
      playMarimbaNote(ctx, 329.63, t + 0.12);
    },
    bell: () => {
      const ctx = ensureAudioCtx();
      if (!ctx) return;
      const t = ctx.currentTime;
      playBellNote(ctx, 329.63, t);
      playBellNote(ctx, 392.0, t + 0.15, 0.22);
    },
    pop: () => {
      const ctx = ensureAudioCtx();
      if (!ctx) return;
      playSweepNote(ctx, 520, 1400, ctx.currentTime, 0.12, 0.3);
    },
    sparkle: () => {
      const ctx = ensureAudioCtx();
      if (!ctx) return;
      const t = ctx.currentTime;
      [1046.5, 1318.5, 1568.0, 2093.0].forEach((f, i) =>
        playSweepNote(ctx, f, f * 1.02, t + i * 0.055, 0.14, 0.18, 'triangle')
      );
    },
    ping: () => {
      const ctx = ensureAudioCtx();
      if (!ctx) return;
      const t = ctx.currentTime;
      const f = 1760;
      playSweepNote(ctx, f, f, t, 0.35, 0.22, 'sine');
      playSweepNote(ctx, f * 2.76, f * 2.76, t, 0.2, 0.08, 'sine');
      playSweepNote(ctx, f * 5.4, f * 5.4, t, 0.1, 0.03, 'sine');
    },
  };
  function playNotificationSound() {
    try {
      ensureAudioCtx();
      const sound = notificationSoundSetting.get();
      SOUND_PLAYERS[sound]?.();
    } catch (e) {}
  }
  function findNotificationBadge() {
    const label = Array.from(document.querySelectorAll('span, div')).find(
      (el) =>
        el.children.length === 0 &&
        el.textContent.trim() === 'Notifications'
    );
    return (
      label?.closest('a, button')?.querySelector('span.rounded-full') ||
      null
    );
  }
  function getNotificationBadgeCount() {
    const badge = findNotificationBadge();
    if (!badge) return 0;
    const count = parseInt(badge.textContent.trim(), 10);
    return Number.isNaN(count) ? 0 : count;
  }
  function showNotificationToast(delta) {
    document
      .querySelectorAll('.tt-notification-toast')
      .forEach((el) => el.remove());
    const toast = document.createElement('div');
    toast.className = 'tt-notification-toast';
    toast.textContent =
      delta === 1
        ? 'You have a new notification!'
        : `You have ${delta} new notifications!`;
    document.body.appendChild(toast);
    playNotificationSound();
    requestAnimationFrame(() => toast.classList.add('tt-toast-show'));
    setTimeout(() => {
      toast.classList.remove('tt-toast-show');
      setTimeout(() => toast.remove(), 250);
    }, CONFIG.notificationToast.displayMs);
  }
  const SITE_VERSION_KEY = 'tweetapp_site_version';
  const SITE_VERSION_PATTERN = /v\d+\.\d+\.\d+\s*·\s*\d+/;
  // playSound=false の場合はポップアップのみ表示し、通知音は鳴らさない
  function showToastMessage(text, playSound = true) {
    document
      .querySelectorAll('.tt-notification-toast')
      .forEach((el) => el.remove());
    const toast = document.createElement('div');
    toast.className = 'tt-notification-toast';
    toast.textContent = text;
    toast.style.cssText =
      'white-space:pre-line;text-align:center;line-height:1.5;width:max-content;max-width:90vw;height:auto;';
    document.body.appendChild(toast);
    if (playSound) {
      playNotificationSound();
    }
    requestAnimationFrame(() => toast.classList.add('tt-toast-show'));
    setTimeout(() => {
      toast.classList.remove('tt-toast-show');
      setTimeout(() => toast.remove(), 250);
    }, CONFIG.notificationToast.displayMs);
  }
  const ISO_TIME_PATTERN =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
  function formatAbsoluteTime(iso, fmt) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) {
      return null;
    }
    const p = (n) => String(n).padStart(2, '0');
    const values = {
      YYYY: String(d.getFullYear()),
      MM: p(d.getMonth() + 1),
      DD: p(d.getDate()),
      hh: p(d.getHours()),
      mm: p(d.getMinutes()),
      ss: p(d.getSeconds()),
    };
    return fmt.replace(/YYYY|MM|DD|hh|mm|ss/g, (t) => values[t]);
  }
  const ABS_TIME_STYLE =
    'white-space:nowrap;font-size:10pt;margin-left:0.25em;';
  function processAbsoluteTimes() {
    if (
      ['yyyy-mm-dd hh:mm:ss', 'YYYY-MM-DD hh:mm:ss'].includes(
        timeFormatSetting.get()
      )
    ) {
      timeFormatSetting.set(CONFIG.timeFormat.default);
    }
    if (!timeEnabledSetting.get()) {
      document
        .querySelectorAll('.tt-abs-time')
        .forEach((el) => el.remove());
      return;
    }
    document
      .querySelectorAll('.tt-abs-time')
      .forEach((el) => (el.style.cssText = ABS_TIME_STYLE));
    const fmt = timeFormatSetting.get();
    if (!fmt) return;
    document.querySelectorAll('span[title]').forEach((el) => {
      if (!ISO_TIME_PATTERN.test(el.title)) {
        return;
      }
      if (el.querySelector(':scope > .tt-abs-time')) {
        return;
      }
      const text = formatAbsoluteTime(el.title, fmt);
      if (!text) return;
      const abs = document.createElement('span');
      abs.className = 'tt-abs-time';
      abs.textContent = text;
      abs.style.cssText = ABS_TIME_STYLE;
      el.appendChild(abs);
    });
  }
  const COMPOSE_PARAM = 'tt_compose';
  function isComposeTabMode() {
    return new URLSearchParams(location.search).has(COMPOSE_PARAM);
  }
  function interceptComposeClick() {
    document.addEventListener(
      'click',
      (e) => {
        if (!composeTabSetting.get()) {
          return;
        }
        if (isComposeTabMode()) {
          return;
        }
        const btn =
          e.target.closest &&
          e.target.closest(
            '#public-sidebar-compose-btn, #public-mobile-compose-btn'
          );
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        const W = 560;
        const H = 600;
        const left = Math.round(screen.width / 2 - W / 2);
        const top = Math.round(screen.height / 2 - H / 2);
        window.open(
          `${location.origin}${location.pathname}?${COMPOSE_PARAM}=1`,
          'tt_compose',
          `left=${left},top=${top},width=${W},height=${H},menubar=no,toolbar=no,location=yes,status=no,scrollbars=yes,resizable=yes`
        );
      },
      true
    );
  }
  function runComposeTabMode() {
    const style = document.createElement('style');
    style.textContent =
      'body.tt-compose-only #root-container { visibility: hidden !important; }' +
      'body.tt-compose-only [data-tt-compose-keep] { visibility: visible !important; }';
    document.head.appendChild(style);
    document.body.classList.add('tt-compose-only');
    const openTimer = setInterval(() => {
      const btn =
        document.getElementById('public-sidebar-compose-btn') ||
        document.getElementById('public-mobile-compose-btn');
      if (!btn) return;
      clearInterval(openTimer);
      btn.click();
    }, 200);
    let shown = false;
    const watchTimer = setInterval(() => {
      const ta = document.getElementById('public-modal-tweet-input');
      if (ta) {
        shown = true;
        const overlay = ta.closest('.fixed');
        if (overlay) {
          overlay.setAttribute('data-tt-compose-keep', '');
        }
        return;
      }
      if (shown) {
        clearInterval(watchTimer);
        window.close();
      }
    }, 300);
  }
  function checkSiteVersion() {
    const el = Array.from(document.querySelectorAll('aside p')).find((p) =>
      SITE_VERSION_PATTERN.test(p.textContent)
    );
    if (!el) return;
    const current = el.textContent.trim();
    const stored = GM_getValue(SITE_VERSION_KEY, '');
    if (current === stored) {
      return;
    }
    GM_setValue(SITE_VERSION_KEY, current);
    if (stored) {
      showToastMessage(`tweet.app updated:\n${stored} →\n${current}`);
    }
  }
  function checkNotificationCount() {
    if (!notificationToastEnabledSetting.get()) {
      return;
    }
    const current = getNotificationBadgeCount();
    if (lastNotificationCount === null) {
      lastNotificationCount = current;
      return;
    }
    if (current > lastNotificationCount) {
      showNotificationToast(current - lastNotificationCount);
    }
    lastNotificationCount = current;
  }
  function startNotificationPolling() {
    setInterval(
      checkNotificationCount,
      CONFIG.notificationToast.pollIntervalMs
    );
  }
  // ============================================================
  // OGPキャッシュ & リンクカード
  // ogpCache: url -> { data, ts }  (成功した結果のみ保持)
  // ogpFail : url -> { n, ts }     (失敗回数と最終失敗時刻。キャッシュには保存しない)
  const ogpCache = new Map();
  const ogpFail = new Map();
  function loadOgpCacheFromStorage() {
    const stored = GM_getValue(CONFIG.linkCard.cacheKey, {});
    const now = Date.now();
    for (const [url, entry] of Object.entries(stored)) {
      if (
        entry?.data &&
        entry?.ts &&
        now - entry.ts < CONFIG.linkCard.cacheTtlMs
      ) {
        ogpCache.set(url, { data: entry.data, ts: entry.ts });
      }
    }
  }
  function persistOgpCache() {
    const entries = Array.from(ogpCache.entries()).slice(
      -CONFIG.linkCard.cacheMaxEntries
    );
    const obj = {};
    for (const [url, entry] of entries) {
      obj[url] = { data: entry.data, ts: entry.ts };
    }
    GM_setValue(CONFIG.linkCard.cacheKey, obj);
  }
  function ogpCooldownMs(failCount) {
    return Math.min(5 * 60 * 1000, 15000 * Math.pow(2, failCount));
  }
  function markOgpFailed(url) {
    const prev = ogpFail.get(url);
    ogpFail.set(url, { n: (prev?.n || 0) + 1, ts: Date.now() });
  }
  function fetchOgp(url, cb) {
    const cached = ogpCache.get(url);
    if (cached) {
      return cb(cached.data);
    }
    const failed = ogpFail.get(url);
    if (
      failed &&
      Date.now() - failed.ts < ogpCooldownMs(failed.n - 1)
    ) {
      return cb(null);
    }
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      timeout: CONFIG.linkCard.fetchTimeoutMs,
      headers: { Accept: 'text/html,application/xhtml+xml' },
      onload: (res) => {
        let data = null;
        if (res.status >= 200 && res.status < 300) {
          try {
            data = parseOgpFromHtml(
              res.responseText,
              res.finalUrl || url
            );
          } catch (e) {
            data = null;
          }
        }
        if (!data) {
          markOgpFailed(url);
          cb(null);
          return;
        }
        ogpFail.delete(url);
        ogpCache.set(url, { data, ts: Date.now() });
        persistOgpCache();
        cb(data);
      },
      onerror: () => {
        markOgpFailed(url);
        cb(null);
      },
      ontimeout: () => {
        markOgpFailed(url);
        cb(null);
      },
    });
  }
  function parseOgpFromHtml(html, baseUrl) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const getMeta = (...props) => {
      for (const prop of props) {
        const v =
          doc.querySelector(`meta[property="${prop}"]`)?.content ||
          doc.querySelector(`meta[name="${prop}"]`)?.content ||
          '';
        if (v && v.trim()) return v.trim();
      }
      return '';
    };
    const title =
      getMeta('og:title', 'twitter:title') ||
      doc.querySelector('title')?.textContent?.trim() ||
      '';
    const description = getMeta(
      'og:description',
      'twitter:description',
      'description'
    );
    let image = getMeta(
      'og:image',
      'og:image:url',
      'twitter:image',
      'twitter:image:src'
    );
    if (image) {
      try {
        image = new URL(image, baseUrl).href;
      } catch (e) {
        image = '';
      }
    }
    if (!title && !image) {
      return null;
    }
    return {
      title,
      description,
      image: image ? { url: image } : null,
    };
  }
  // 本文中の最初の「外部」リンクを返す(同一オリジンのメンション/ハッシュタグ等は除外)
  function extractUrl(article) {
    const links = article.querySelectorAll('p a[href^="http"]');
    for (const a of links) {
      let u;
      try {
        u = new URL(a.href);
      } catch (e) {
        continue;
      }
      if (u.origin === location.origin) continue;
      return { url: u.href, link: a };
    }
    return null;
  }
  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
  function buildLinkCard(data, url) {
    const wrapper = document.createElement('div');
    wrapper.dataset.ogpCard = url;
    wrapper.className = `rounded-2xl overflow-hidden ${CONFIG.linkCard.className}`;
    wrapper.style.cssText =
      'margin-top:8px;margin-left:auto;margin-right:auto;';
    const card = document.createElement('a');
    card.href = url;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    card.style.cssText =
      'display:block;border:1px solid #d9d9d9;border-radius:12px;overflow:hidden;text-decoration:none;color:inherit;';
    const hostname = escapeHtml(new URL(url).hostname);
    const title = escapeHtml(data.title || '');
    const description = escapeHtml((data.description || '').slice(0, 100));
    const image = data.image?.url
      ? `<img src="${escapeHtml(
          data.image.url
        )}" style="width:100%;max-height:200px;object-fit:cover;display:block;">`
      : '';
    card.innerHTML = `
      ${image}
      <div style="padding:8px 12px;">
        <div style="font-size:13px;color:#536471;">${hostname}</div>
        <div style="font-weight:600;font-size:14px;margin-top:2px;">${title}</div>
        <div style="font-size:13px;color:#536471;margin-top:2px;">${description}</div>
      </div>`;
    wrapper.appendChild(card);
    return wrapper;
  }
  function removeAllLinkCards() {
    document
      .querySelectorAll('[data-ogp-card]')
      .forEach((el) => el.remove());
    document
      .querySelectorAll('article[data-ogp-fetching]')
      .forEach((el) => delete el.dataset.ogpFetching);
  }
  // カード挿入位置: リンクを含む段落の直後。続く兄弟にメディアがあればその最後の直後。
  function findCardAnchor(link) {
    const p = link.closest('p') || link;
    let anchor = p;
    let sib = p.nextElementSibling;
    while (sib) {
      if (
        !sib.hasAttribute('data-ogp-card') &&
        (sib.matches('div.rounded-2xl.overflow-hidden') ||
          sib.querySelector('img[alt="Attached media"], video'))
      ) {
        anchor = sib;
      }
      sib = sib.nextElementSibling;
    }
    return anchor;
  }
  function processArticle(article) {
    if (!linkCardEnabledSetting.get()) {
      return;
    }
    const found = extractUrl(article);
    const existingCard = article.querySelector('[data-ogp-card]');
    if (!found) {
      if (existingCard) {
        existingCard.remove();
      }
      delete article.dataset.ogpFetching;
      return;
    }
    const url = found.url;
    if (existingCard) {
      if (existingCard.dataset.ogpCard === url) {
        return;
      }
      existingCard.remove();
      delete article.dataset.ogpFetching;
    }
    if (article.dataset.ogpFetching === url) {
      return;
    }
    article.dataset.ogpFetching = url;
    fetchOgp(url, (data) => {
      if (article.dataset.ogpFetching !== url) {
        return;
      }
      delete article.dataset.ogpFetching;
      if (!linkCardEnabledSetting.get()) {
        return;
      }
      if (!data) return;
      if (article.querySelector('[data-ogp-card]')) {
        return;
      }
      // 取得中にDOMが変わった場合に備えて再取得
      const current = extractUrl(article);
      if (!current || current.url !== url) {
        return;
      }
      const linkCard = buildLinkCard(data, url);
      findCardAnchor(current.link).insertAdjacentElement(
        'afterend',
        linkCard
      );
    });
  }
  // ============================================================
  // 投稿(compose)欄の翻訳機能 & GIFボタン設定
  function buildTranslateUrl(endpoint, text, lang) {
    if (endpoint === 'primary') {
      return (
        'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' +
        encodeURIComponent(lang) +
        '&dt=t&q=' +
        encodeURIComponent(text)
      );
    }
    return (
      'https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=' +
      encodeURIComponent(lang) +
      '&q=' +
      encodeURIComponent(text)
    );
  }
  function parseTranslateResponse(endpoint, responseText) {
    const data = JSON.parse(responseText);
    if (endpoint === 'primary') {
      return data[0].map((seg) => seg[0]).join('');
    }
    if (Array.isArray(data) && Array.isArray(data[0])) {
      return data[0][0];
    }
    if (Array.isArray(data) && typeof data[0] === 'string') {
      return data[0];
    }
    if (data.sentences) {
      return data.sentences.map((s) => s.trans).join('');
    }
    throw new Error('unexpected format');
  }
  function requestTranslateOnce(endpoint, text, lang, onSuccess, onFail) {
    GM_xmlhttpRequest({
      method: 'GET',
      url: buildTranslateUrl(endpoint, text, lang),
      onload: function (res) {
        if (res.status < 200 || res.status >= 300) {
          onFail(res.status, res.responseText);
          return;
        }
        try {
          onSuccess(parseTranslateResponse(endpoint, res.responseText));
        } catch (err) {
          onFail('parse', res.responseText);
        }
      },
      onerror: function (err) {
        onFail('network', err);
      },
      ontimeout: function () {
        onFail('timeout', null);
      },
    });
  }
  function callTranslateApi(text, lang, onSuccess, onFail) {
    requestTranslateOnce('primary', text, lang, onSuccess, (status) => {
      if (status === 429) {
        requestTranslateOnce('fallback', text, lang, onSuccess, (status2) => {
          onFail(
            status2 === 429
              ? 'Rate limited — please wait a moment and try again'
              : 'HTTP ' + status2
          );
        });
      } else {
        onFail(
          status === 'parse'
            ? 'Parse error'
            : status === 'network'
              ? 'Network error'
              : status === 'timeout'
                ? 'Timeout'
                : 'HTTP ' + status
        );
      }
    });
  }
  function getComposeText(el) {
    return el.tagName === 'TEXTAREA' ? el.value : el.textContent;
  }
  function updateComposeBtnLabel(btn) {
    const lang = translateLangSetting.get();
    if (lang === CONFIG.translate.noneValue) {
      btn.style.display = 'none';
      return;
    }
    btn.style.display = '';
    if (btn.dataset.ttState === 'loading') {
      btn.textContent = `🌐 Translating... (${lang})`;
    } else {
      btn.textContent = `🌐 Insert translation (${lang})`;
    }
  }
  function refreshAllTranslateBtnLabels() {
    document
      .querySelectorAll('.tt-compose-btn')
      .forEach(updateComposeBtnLabel);
  }
  function insertTranslationIntoCompose(el, translatedText) {
    if (el.tagName === 'TEXTAREA') {
      const current = el.value;
      const sep = current.endsWith('\n') || current === '' ? '' : '\n';
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      ).set;
      nativeSetter.call(el, current + sep + translatedText);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      const br = document.createElement('br');
      const textNode = document.createTextNode(translatedText);
      el.appendChild(br);
      el.appendChild(textNode);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  function findActionBar(composeEl) {
    let current = composeEl;
    while (current && current.tagName !== 'BODY') {
      const parent = current.parentElement;
      if (!parent) break;
      const nextSibling = current.nextElementSibling;
      if (
        nextSibling &&
        nextSibling.textContent.includes('Photo') &&
        nextSibling.textContent.includes('Video')
      ) {
        return nextSibling;
      }
      const flexes = parent.querySelectorAll(
        '[class*="flex"][class*="gap"], [class*="flex items"]'
      );
      for (const flex of flexes) {
        if (
          flex.textContent.includes('Photo') &&
          flex.textContent.includes('Video')
        ) {
          return flex;
        }
      }
      current = parent;
    }
    return null;
  }
  function pinPopupTop(textarea) {
    let overlay = null;
    let el = textarea.parentElement;
    while (el && el !== document.body) {
      if (getComputedStyle(el).position === 'fixed') {
        overlay = el;
        break;
      }
      el = el.parentElement;
    }
    if (!overlay) return;
    let card = textarea;
    while (card.parentElement && card.parentElement !== overlay) {
      card = card.parentElement;
    }
    if (card === textarea || card.parentElement !== overlay) {
      return;
    }
    const top = card.getBoundingClientRect().top;
    overlay.style.setProperty('align-items', 'flex-start', 'important');
    overlay.style.setProperty('place-items', 'start center', 'important');
    card.style.setProperty('top', '10px', 'important');
    card.style.setProperty('margin-bottom', '0', 'important');
    requestAnimationFrame(() => {
      const diff = card.getBoundingClientRect().top - top;
      if (Math.abs(diff) > 1) {
        // 表示直後の位置(left)を固定すると横にズレるため、
        // left/right:0 + margin:auto でビューポート中央に配置する。
        // 幅は transform の影響を受けない offsetWidth から取得する。
        const w = card.offsetWidth;
        card.style.setProperty('margin-top', '0', 'important');
        card.style.setProperty('position', 'fixed', 'important');
        card.style.setProperty('top', '10px', 'important');
        card.style.setProperty('left', '0', 'important');
        card.style.setProperty('right', '0', 'important');
        card.style.setProperty('margin-left', 'auto', 'important');
        card.style.setProperty('margin-right', 'auto', 'important');
        card.style.setProperty('width', w + 'px', 'important');
        card.style.setProperty('max-width', 'calc(100vw - 32px)', 'important');
        card.style.setProperty('transform', 'none', 'important');
      }
    });
  }
  function autoGrowTextarea(textarea) {
    if (textarea.tagName !== 'TEXTAREA') {
      return;
    }
    if (
      !GM_getValue(
        CONFIG.autogrow.enabledKey,
        CONFIG.autogrow.enabledDefault
      )
    ) {
      return;
    }
    textarea.style.overflowY = 'hidden';
    textarea.style.resize = 'none';
    function resize() {
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
    }
    resize();
    textarea.addEventListener('input', resize);
    requestAnimationFrame(() => pinPopupTop(textarea));
  }
  function processComposeBoxes(root = document) {
    const els = collectMatching(root, CONFIG.translate.composeSelector);
    els.forEach((el) => {
      if (el.dataset.ttComposeDone) {
        return;
      }
      el.dataset.ttComposeDone = '1';
      if (el.tagName === 'TEXTAREA') {
        autoGrowTextarea(el);
      }
      const btn = document.createElement('div');
      btn.className = 'tt-compose-btn';
      btn.dataset.ttState = 'idle';
      updateComposeBtnLabel(btn);
      const gifBtn = document.createElement('div');
      gifBtn.className = 'tt-gif-btn';
      gifBtn.textContent = 'GIF';
      gifBtn.title = 'Search and attach GIFs (Tenor)';
      updateGifBtnVisibility(gifBtn);
      gifBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openGifPicker(el);
      });
      let resultEl = null;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (translateLangSetting.get() === CONFIG.translate.noneValue) {
          return;
        }
        const text = getComposeText(el).trim();
        if (!text) return;
        btn.dataset.ttState = 'loading';
        updateComposeBtnLabel(btn);
        const lang = translateLangSetting.get();
        callTranslateApi(
          text,
          lang,
          (translated) => {
            btn.dataset.ttState = 'idle';
            updateComposeBtnLabel(btn);
            if (!resultEl) {
              resultEl = document.createElement('div');
              resultEl.className = 'tt-compose-result';
              resultEl.title = 'Click to insert into the compose box';
              btn.insertAdjacentElement('afterend', resultEl);
              resultEl.addEventListener('click', () => {
                insertTranslationIntoCompose(el, resultEl.textContent);
                resultEl.remove();
                resultEl = null;
              });
            }
            resultEl.textContent = translated;
          },
          (errMsg) => {
            btn.dataset.ttState = 'idle';
            updateComposeBtnLabel(btn);
            if (!resultEl) {
              resultEl = document.createElement('div');
              resultEl.className = 'tt-compose-result';
              btn.insertAdjacentElement('afterend', resultEl);
            }
            resultEl.textContent = '⚠️ Translation failed: ' + errMsg;
          }
        );
      });
      const actionBar = findActionBar(el);
      if (actionBar) {
        const firstChild = actionBar.firstElementChild;
        if (firstChild) {
          firstChild.insertAdjacentElement('beforebegin', gifBtn);
          firstChild.insertAdjacentElement('beforebegin', btn);
        } else {
          actionBar.appendChild(gifBtn);
          actionBar.appendChild(btn);
        }
      } else {
        el.insertAdjacentElement('afterend', gifBtn);
        el.insertAdjacentElement('afterend', btn);
      }
    });
  }
  // ============================================================
  // リポスト非表示フィルター
  function isRepostedArticle(article) {
    const spans = article.querySelectorAll(':scope span');
    for (const span of spans) {
      if (span.textContent.includes('reposted')) {
        return true;
      }
    }
    return false;
  }
  function applyHideRepostFilter(root = document) {
    if (!hideRepostEnabledSetting.get()) {
      return;
    }
    const articles = collectMatching(root, 'article');
    articles.forEach((article) => {
      if (isRepostedArticle(article)) {
        article.style.display = 'none';
      }
    });
  }
  // ============================================================
  // インラインリプライ欄への@ハンドル自動入力
  function extractHandleFromLabel(label) {
    const match = label.match(/^View @(.+?)(?:'s|'s) profile$/);
    return match ? match[1] : null;
  }
  function findHandleForTextarea(textarea) {
    const article = textarea.closest('article');
    if (article) {
      const btn = article.querySelector(
        ':scope > div.flex.items-start.gap-3 > button[aria-label^="View @"]'
      );
      const handle = extractHandleFromLabel(
        btn?.getAttribute('aria-label') || ''
      );
      if (handle) {
        return handle;
      }
    }
    const form = textarea.closest('[role="form"]');
    if (form) {
      let el = form.parentElement;
      while (el && el !== document.body) {
        const btn = el.querySelector('button[aria-label^="View @"]');
        if (btn) {
          const handle = extractHandleFromLabel(
            btn.getAttribute('aria-label')
          );
          if (handle) {
            return handle;
          }
        }
        el = el.parentElement;
      }
    }
    return null;
  }
  function prefillInlineReplyHandles(root = document) {
    if (!replyPrefillEnabledSetting.get()) {
      return;
    }
    const textareas =
      root instanceof HTMLTextAreaElement && root.name === 'compose-text'
        ? [root]
        : Array.from(
            root.querySelectorAll?.('textarea[name="compose-text"]') || []
          );
    textareas.forEach((textarea) => {
      if (textarea.dataset.ttPrefillDone) {
        return;
      }
      const handle = findHandleForTextarea(textarea);
      if (!handle) return;
      textarea.dataset.ttPrefillDone = '1';
      if (textarea.value.trim() !== '') {
        return;
      }
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      ).set;
      nativeSetter.call(textarea, `@${handle} `);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.setSelectionRange(
        textarea.value.length,
        textarea.value.length
      );
    });
  }
  // ============================================================
  // DOM監視
  function handleAddedNode(node) {
    if (node.nodeType !== 1) {
      return;
    }
    // 記事内部だけが再描画された場合(カードが消えた場合など)にも対応
    const parentArticle = node.closest?.('article');
    if (parentArticle) {
      processArticle(parentArticle);
    }
    node.querySelectorAll?.('article').forEach(processArticle);
    applyFontSizeToComposers(node);
    applyAutoplaySetting(node);
    processComposeBoxes(node);
    prefillInlineReplyHandles(node);
    applyHideRepostFilter(node);
    injectNavMenu();
  }
  function handleRouteChange() {
    applyStyles();
    applyHideRepostFilter();
    injectNavMenu();
  }
  function watchRouteChanges() {
    const origPushState = history.pushState;
    const origReplaceState = history.replaceState;
    history.pushState = function (...args) {
      origPushState.apply(this, args);
      setTimeout(handleRouteChange, 50);
    };
    history.replaceState = function (...args) {
      origReplaceState.apply(this, args);
      setTimeout(handleRouteChange, 50);
    };
    window.addEventListener('popstate', () =>
      setTimeout(handleRouteChange, 50)
    );
  }
  function startObserving() {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach(handleAddedNode);
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }
  // ============================================================
  // 初期化
  function init() {
    applyCustomCss();
    applyAvatarShape();
    if (isComposeTabMode()) {
      runComposeTabMode();
    } else {
      interceptComposeClick();
    }
    loadOgpCacheFromStorage();
    applyStyles();
    applyAutoplaySetting();
    applyHideRepostFilter();
    startObserving();
    watchRouteChanges();
    document.querySelectorAll('article').forEach(processArticle);
    processComposeBoxes();
    prefillInlineReplyHandles();
    injectNavMenu();
    startNotificationPolling();
    setInterval(() => {
      injectNavMenu();
      checkSiteVersion();
      processAbsoluteTimes();
      // リンクカードの取りこぼし・再描画で消えた分を補う
      if (linkCardEnabledSetting.get()) {
        document.querySelectorAll('article').forEach(processArticle);
      }
    }, 1000);
    requestAnimationFrame(() => {
      applyStyles();
      applyAutoplaySetting();
      applyHideRepostFilter();
    });
    setTimeout(() => {
      applyStyles();
      applyAutoplaySetting();
      applyHideRepostFilter();
    }, 500);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, {
      once: true,
    });
  } else {
    init();
  }

  } // end runContentScript
})();
