// ==UserScript==
// @name         Tweet.app Enhancer
// @namespace    https://imgd.net/
// @version      1.2
// @description  Font size, content width, always-visible composer, video/GIF autoplay, OGP link cards, compose translation, swipe photo gallery, and reply @handle prefill for app.tweet.app — all configurable from the Settings page.
// @match        https://app.tweet.app/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      *
// @connect      translate.googleapis.com
// @connect      clients5.google.com
// @icon         https://app.tweet.app/assets/brand/bird-blue.svg
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  // ============================================================
  // CONFIG
  // ============================================================

  const CONFIG = {
    font: {
      key: 'tweetapp_font_size_px',
      default: 15,
      presets: [15, 18, 22],
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
      cacheKey: 'tweetapp_ogp_cache_v1',
      cacheMaxEntries: 300,
      cacheTtlMs: 7 * 24 * 60 * 60 * 1000,
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
      manualPlayGraceMs: 1500,
    },
    replyPrefill: {
      enabledKey: 'tweetapp_reply_prefill_enabled',
      enabledDefault: false,
    },
    gallery: {
      enabledKey: 'tweetapp_gallery_enabled',
      enabledDefault: false,
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
  // ============================================================

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
  const autoplayEnabledSetting = createSetting(CONFIG.autoplay.enabledKey, CONFIG.autoplay.enabledDefault, () => applyAutoplaySetting());
  const translateLangSetting = createSetting(CONFIG.translate.key, CONFIG.translate.default, () => refreshAllTranslateBtnLabels());
  const replyPrefillEnabledSetting = createSetting(CONFIG.replyPrefill.enabledKey, CONFIG.replyPrefill.enabledDefault, () => {});
  const galleryEnabledSetting = createSetting(CONFIG.gallery.enabledKey, CONFIG.gallery.enabledDefault, () => {});

  // ============================================================
  // 動画・GIF自動再生制御
  // ============================================================

  const manualPlayUntil = new WeakMap();

  function isTrackedVideo(node) {
    return node instanceof HTMLVideoElement && !!node.closest('article');
  }

  function getVideoFromEventTarget(target) {
    if (!(target instanceof Element)) return null;
    const video = target.closest('article video');
    return video instanceof HTMLVideoElement ? video : null;
  }

  function markManualVideoGesture(event) {
    const video = getVideoFromEventTarget(event.target);
    if (!video) return;
    manualPlayUntil.set(video, Date.now() + CONFIG.autoplay.manualPlayGraceMs);
  }

  function isManualVideoPlay(video) {
    const until = manualPlayUntil.get(video) || 0;
    if (until > Date.now()) return true;
    manualPlayUntil.delete(video);
    return false;
  }

  function stopVideo(video) {
    if (!(video instanceof HTMLVideoElement)) return;
    video.autoplay = false;
    video.removeAttribute('autoplay');
    video.pause();
  }

  function startVideo(video) {
    if (!(video instanceof HTMLVideoElement)) return;
    video.autoplay = true;
    if (!video.hasAttribute('autoplay')) video.setAttribute('autoplay', '');
    video.muted = true;
    if (video.paused) video.play().catch(() => {});
  }

  function applyAutoplayToVideo(video) {
    if (!isTrackedVideo(video)) return;
    if (autoplayEnabledSetting.get()) startVideo(video);
    else stopVideo(video);
  }

  function applyAutoplaySetting(root = document) {
    const enabled = autoplayEnabledSetting.get();
    const videos = [];

    if (root instanceof HTMLVideoElement) {
      videos.push(root);
    } else {
      root.querySelectorAll?.('article video').forEach((video) => videos.push(video));
    }

    videos.forEach((video) => {
      if (!(video instanceof HTMLVideoElement)) return;
      if (enabled) startVideo(video);
      else stopVideo(video);
    });
  }

  document.addEventListener('pointerdown', markManualVideoGesture, true);
  document.addEventListener('touchstart', markManualVideoGesture, true);
  document.addEventListener('mousedown', markManualVideoGesture, true);
  document.addEventListener('keydown', markManualVideoGesture, true);

  document.addEventListener('play', (event) => {
    const video = event.target;
    if (!isTrackedVideo(video)) return;
    if (autoplayEnabledSetting.get()) return;
    if (isManualVideoPlay(video)) return;

    video.pause();
    video.autoplay = false;
    video.removeAttribute('autoplay');
  }, true);

  document.addEventListener('playing', (event) => {
    const video = event.target;
    if (!isTrackedVideo(video)) return;
    if (autoplayEnabledSetting.get()) return;
    if (isManualVideoPlay(video)) return;

    video.pause();
  }, true);

  // ============================================================
  // 選択パネルCSS
  // ============================================================

  const CHOICE_PANEL_CSS = `
    #tweetapp-choice-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.4);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    #tweetapp-choice-panel {
      background: #fff;
      border-radius: 14px;
      min-width: 240px;
      max-width: 90vw;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    }
    #tweetapp-choice-panel .tweetapp-choice-title {
      padding: 14px 16px 8px;
      font-size: 13px;
      color: #536471;
      border-bottom: 1px solid #eee;
    }
    #tweetapp-choice-panel .tweetapp-choice-item {
      display: block;
      width: 100%;
      text-align: left;
      padding: 14px 16px;
      font-size: 16px;
      color: #0f1419;
      background: #fff;
      border: none;
      border-bottom: 1px solid #eee;
    }
    #tweetapp-choice-panel .tweetapp-choice-item:last-of-type {
      border-bottom: none;
    }
    #tweetapp-choice-panel .tweetapp-choice-item:active {
      background: #f0f3f4;
    }
    #tweetapp-choice-panel .tweetapp-choice-item.tweetapp-choice-current {
      color: #1d9bf0;
      font-weight: 600;
    }
    #tweetapp-choice-panel .tweetapp-choice-cancel {
      display: block;
      width: 100%;
      text-align: center;
      padding: 14px 16px;
      font-size: 15px;
      color: #536471;
      background: #f7f8f8;
      border: none;
    }
  `;

  // ============================================================
  // スタイル適用
  // ============================================================

  function applyStyles() {
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'tweetapp-appearance-style';
      if (document.documentElement) document.documentElement.appendChild(styleEl);
    }

    const fontSize = fontSizeSetting.get();
    const mediaPct = mediaPctSetting.get();
    const composerVisible = composerVisibleSetting.get();

    styleEl.textContent = `
      /* ツイート本文のフォントサイズ */
      article p {
        font-size: ${fontSize}px !important;
        line-height: 1.5 !important;
      }

      /* 入力テキストエリアおよび裏側のミラー表示要素（文字＆カーソル位置ずれ防止） */
      textarea#public-tweet-input,
      textarea#public-modal-tweet-input,
      textarea[name="compose-text"],
      textarea,
      div:has(> textarea) [aria-hidden="true"],
      div:has(> textarea) div {
        font-size: ${fontSize}px !important;
        line-height: 1.5 !important;
      }

      /* 画像・動画・リンクカードの表示幅(記事内・News/Sportsタブのリンクカード両方に適用) */
      div.rounded-2xl.overflow-hidden,
      div.${CONFIG.linkCard.className} {
        width: ${mediaPct}% !important;
        margin-left: auto !important;
        margin-right: auto !important;
      }

      /* 常時表示の投稿欄（フィード最上部のみ） */
      ${composerVisible ? '' : `
      ${CONFIG.composer.containerSelector} {
        display: none !important;
      }`}

      ${CHOICE_PANEL_CSS}
      ${TRANSLATE_BTN_CSS}
      ${GALLERY_CSS}
      ${SETTINGS_PANEL_CSS}
    `;

    applyFontSizeToBodies();
    applyFontSizeToComposers();
  }

  function applyFontSizeToBodies(root = document) {
    const fontSize = fontSizeSetting.get();
    root.querySelectorAll?.('article p').forEach((p) => {
      p.style.setProperty('font-size', `${fontSize}px`, 'important');
      p.style.setProperty('line-height', '1.5', 'important');
    });
  }

  function applyFontSizeToComposers(root = document) {
    const fontSize = fontSizeSetting.get();
    root.querySelectorAll?.(CONFIG.composer.textareaSelector).forEach((textarea) => {
      textarea.style.setProperty('font-size', `${fontSize}px`, 'important');
      textarea.style.setProperty('line-height', '1.5', 'important');

      if (textarea.parentElement) {
        textarea.parentElement.querySelectorAll('*').forEach((el) => {
          el.style.setProperty('font-size', `${fontSize}px`, 'important');
          el.style.setProperty('line-height', '1.5', 'important');
        });
      }
    });
  }

  // ============================================================
  // 選択パネル
  // ============================================================

  function showChoicePanel(title, items, currentIndex, onSelect) {
    const overlay = document.createElement('div');
    overlay.id = 'tweetapp-choice-overlay';

    const panel = document.createElement('div');
    panel.id = 'tweetapp-choice-panel';

    const titleEl = document.createElement('div');
    titleEl.className = 'tweetapp-choice-title';
    titleEl.textContent = title;
    panel.appendChild(titleEl);

    items.forEach((label, i) => {
      const isCurrent = i === currentIndex;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tweetapp-choice-item' + (isCurrent ? ' tweetapp-choice-current' : '');
      btn.textContent = label + (isCurrent ? ' (current)' : '');
      btn.addEventListener('click', () => {
        overlay.remove();
        onSelect(i);
      });
      panel.appendChild(btn);
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'tweetapp-choice-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => overlay.remove());
    panel.appendChild(cancelBtn);

    overlay.appendChild(panel);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  function chooseFontSize() {
    const presets = CONFIG.font.presets;
    const items = presets.map((px) => `${px}px`);
    const curIdx = presets.indexOf(fontSizeSetting.get());
    showChoicePanel('Select font size', items, curIdx, (i) => fontSizeSetting.set(presets[i]));
  }

  function chooseMediaWidth() {
    const presets = CONFIG.media.presets;
    const items = presets.map((m) => `${m.label}(${m.pct}%)`);
    const curIdx = presets.findIndex((m) => m.pct === mediaPctSetting.get());
    showChoicePanel('Select content width', items, curIdx, (i) => mediaPctSetting.set(presets[i].pct));
  }

  function chooseTranslateLang() {
    const langs = CONFIG.translate.langs;
    const items = langs.map(([, label]) => label);
    const curIdx = langs.findIndex(([code]) => code === translateLangSetting.get());
    showChoicePanel('Select translate target language', items, curIdx, (i) => translateLangSetting.set(langs[i][0]));
  }

  function clearOgpCache() {
    GM_setValue(CONFIG.linkCard.cacheKey, {});
    ogpCache.clear();
    alert('Link card cache cleared');
  }

  // ============================================================
  // /settings ページへの設定パネル埋め込み
  // ============================================================

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
  `;

  function createSettingsRow(title, description, controlEl) {
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between gap-3 px-4 py-3.5';

    const textWrap = document.createElement('div');
    textWrap.className = 'flex flex-col min-w-0 flex-1';

    const titleEl = document.createElement('span');
    titleEl.className = 'text-[13px] font-bold text-tl-app-text';
    titleEl.textContent = title;
    textWrap.appendChild(titleEl);

    if (description) {
      const descEl = document.createElement('span');
      descEl.className = 'text-[11px] text-tl-app-text-muted truncate';
      descEl.textContent = description;
      textWrap.appendChild(descEl);
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

    return { el: btn, render };
  }

  function createActionValueControl(getLabel, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tt-settings-value-btn';

    function render() {
      btn.textContent = getLabel();
    }
    render();

    btn.addEventListener('click', () => {
      onClick();
      // showChoicePanelは非同期で選択されるため、少し遅延して再描画
      setTimeout(render, 50);
      setTimeout(render, 400);
    });

    return { el: btn, render };
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
    card.className = 'rounded-2xl border border-tl-app-border overflow-hidden divide-y divide-tl-app-border';

    // Font size
    const fontSizeCtrl = createActionValueControl(
      () => `${fontSizeSetting.get()}px`,
      chooseFontSize
    );
    card.appendChild(createSettingsRow('Font size', 'Text size for tweets', fontSizeCtrl.el));

    // Content width
    const mediaWidthCtrl = createActionValueControl(
      () => {
        const m = CONFIG.media.presets.find((p2) => p2.pct === mediaPctSetting.get());
        return m ? `${m.label} (${m.pct}%)` : `${mediaPctSetting.get()}%`;
      },
      chooseMediaWidth
    );
    card.appendChild(createSettingsRow('Content width', 'Width of media and content area', mediaWidthCtrl.el));

    // Reply @handle prefill
    const replyPrefillToggle = createToggleControl(replyPrefillEnabledSetting, 'ON', 'OFF');
    card.appendChild(createSettingsRow('Reply @handle prefill', 'Prefill @handle when replying inline to a tweet', replyPrefillToggle.el));

    // Translate target language
    const translateCtrl = createActionValueControl(
      () => {
        const l = CONFIG.translate.langs.find(([code]) => code === translateLangSetting.get());
        return l ? l[1] : translateLangSetting.get();
      },
      chooseTranslateLang
    );
    card.appendChild(createSettingsRow('Translate target language', 'Language used when translating your draft before posting', translateCtrl.el));

    // Composer visibility
    const composerToggle = createToggleControl(composerVisibleSetting, 'Shown', 'Hidden');
    card.appendChild(createSettingsRow('Always-visible composer', 'Show the tweet box at the top of the feed', composerToggle.el));

    // Swipe gallery
    const galleryToggle = createToggleControl(galleryEnabledSetting, 'ON', 'OFF');
    card.appendChild(createSettingsRow('Swipe gallery', 'Swipe/keyboard navigation for multi-photo tweets', galleryToggle.el));

    // Autoplay
    const autoplayToggle = createToggleControl(autoplayEnabledSetting, 'ON', 'OFF');
    card.appendChild(createSettingsRow('Video/GIF autoplay', 'Automatically play videos and GIFs while scrolling', autoplayToggle.el));

    // Link card
    const linkCardToggle = createToggleControl(linkCardEnabledSetting, 'ON', 'OFF');
    card.appendChild(createSettingsRow('Link card previews', 'Show OGP preview cards for links in tweets', linkCardToggle.el));

    // Clear link card cache
    const clearCacheBtn = document.createElement('button');
    clearCacheBtn.type = 'button';
    clearCacheBtn.className = 'tt-settings-value-btn';
    clearCacheBtn.textContent = 'Clear';
    clearCacheBtn.addEventListener('click', clearOgpCache);
    card.appendChild(createSettingsRow('Link card cache', 'Clear cached link preview data', clearCacheBtn));

    section.appendChild(titleBlock);
    section.appendChild(card);
    return section;
  }

  function injectSettingsSection() {
    if (!location.pathname.startsWith('/settings')) return;
    if (document.getElementById('tweetapp-enhancements-section')) return;

    // "Display" 見出しを目印に、同じflex-col gap-5コンテナへ追記
    const displayHeading = Array.from(document.querySelectorAll('h4')).find(
      (h) => h.textContent.trim() === 'Display'
    );
    const container = displayHeading?.closest('.flex.flex-col.gap-5');
    if (!container) return;

    container.appendChild(buildSettingsSection());
  }

  // ============================================================
  // OGPキャッシュ & リンクカード
  // ============================================================

  const ogpCache = new Map();

  function loadOgpCacheFromStorage() {
    const stored = GM_getValue(CONFIG.linkCard.cacheKey, {});
    const now = Date.now();
    for (const [url, entry] of Object.entries(stored)) {
      if (entry?.ts && now - entry.ts < CONFIG.linkCard.cacheTtlMs) {
        ogpCache.set(url, entry.data);
      }
    }
  }

  function persistOgpCache() {
    const now = Date.now();
    const entries = Array.from(ogpCache.entries()).slice(-CONFIG.linkCard.cacheMaxEntries);
    const obj = {};
    for (const [url, data] of entries) {
      obj[url] = { data, ts: now };
    }
    GM_setValue(CONFIG.linkCard.cacheKey, obj);
  }

  function fetchOgp(url, cb) {
    if (ogpCache.has(url)) return cb(ogpCache.get(url));

    GM_xmlhttpRequest({
      method: 'GET',
      url,
      onload: (res) => {
        try {
          const data = parseOgpFromHtml(res.responseText);
          ogpCache.set(url, data);
          persistOgpCache();
          cb(data);
        } catch (e) {
          cb(null);
        }
      },
      onerror: () => cb(null),
    });
  }

  function parseOgpFromHtml(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const getMeta = (prop) =>
      doc.querySelector(`meta[property="${prop}"]`)?.content
      || doc.querySelector(`meta[name="${prop}"]`)?.content
      || '';

    const title = getMeta('og:title') || doc.querySelector('title')?.textContent || '';
    const description = getMeta('og:description') || getMeta('description');
    const image = getMeta('og:image');

    if (!title && !image) return null;
    return { title, description, image: image ? { url: image } : null };
  }

  function extractUrl(article) {
    return article.querySelector('p a[href^="http"]')?.href ?? null;
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
    wrapper.style.cssText = 'margin-top:8px;margin-left:auto;margin-right:auto;';

    const card = document.createElement('a');
    card.href = url;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    card.style.cssText = 'display:block;border:1px solid #d9d9d9;border-radius:12px;overflow:hidden;text-decoration:none;color:inherit;';

    const hostname = escapeHtml(new URL(url).hostname);
    const title = escapeHtml(data.title || '');
    const description = escapeHtml((data.description || '').slice(0, 100));
    const image = data.image?.url
      ? `<img src="${escapeHtml(data.image.url)}" style="width:100%;max-height:200px;object-fit:cover;display:block;">`
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
    document.querySelectorAll('[data-ogp-card]').forEach((el) => el.remove());
    document.querySelectorAll('article[data-ogp-fetching]').forEach((el) => delete el.dataset.ogpFetching);
  }

  function processArticle(article) {
    if (!linkCardEnabledSetting.get()) return;

    const url = extractUrl(article);
    const existingCard = article.querySelector('[data-ogp-card]');

    if (!url) {
      if (existingCard) existingCard.remove();
      delete article.dataset.ogpFetching;
      return;
    }

    if (existingCard) {
      if (existingCard.dataset.ogpCard === url) return;
      existingCard.remove();
      delete article.dataset.ogpFetching;
    }

    if (article.dataset.ogpFetching === url) return;
    article.dataset.ogpFetching = url;

    fetchOgp(url, (data) => {
      if (article.dataset.ogpFetching !== url) return;
      delete article.dataset.ogpFetching;

      if (!linkCardEnabledSetting.get()) return;
      if (!data) return;
      if (article.querySelector('[data-ogp-card]')) return;

      article.querySelector('p')?.insertAdjacentElement('afterend', buildLinkCard(data, url));
    });
  }

  // ============================================================
  // 投稿(compose)欄の翻訳機能
  // ============================================================

  const TRANSLATE_BTN_CSS = `
    .tt-compose-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
      color: rgb(101,119,134);
      font-size: 13px;
      margin-top: 6px;
      user-select: none;
      width: fit-content;
    }
    .tt-compose-btn:hover { color: #1da1f2; }
    .tt-compose-result {
      margin-top: 6px;
      padding: 8px 10px;
      background: rgba(23,191,99,0.08);
      border-left: 3px solid #17bf63;
      border-radius: 4px;
      font-size: 14px;
      white-space: pre-wrap;
      cursor: pointer;
    }
  `;

  function buildTranslateUrl(endpoint, text, lang) {
    if (endpoint === 'primary') {
      return (
        'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' +
        encodeURIComponent(lang) +
        '&dt=t&q=' +
        encodeURIComponent(text)
      );
    }
    // フォールバック: clients5経由
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
    // clients5(dict-chrome-ex)形式: [["翻訳結果","検出された原文言語コード"]]
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
    // primaryが429ならfallbackへ切替
    requestTranslateOnce(
      'primary',
      text,
      lang,
      onSuccess,
      (status) => {
        if (status === 429) {
          requestTranslateOnce(
            'fallback',
            text,
            lang,
            onSuccess,
            (status2) => {
              onFail(
                status2 === 429
                  ? 'Rate limited — please wait a moment and try again'
                  : 'HTTP ' + status2
              );
            }
          );
        } else {
          onFail(status === 'parse' ? 'Parse error' : status === 'network' ? 'Network error' : status === 'timeout' ? 'Timeout' : 'HTTP ' + status);
        }
      }
    );
  }

  function getComposeEls() {
    return Array.from(document.querySelectorAll(CONFIG.translate.composeSelector));
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
    document.querySelectorAll('.tt-compose-btn').forEach(updateComposeBtnLabel);
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
      // contenteditable
      const br = document.createElement('br');
      const textNode = document.createTextNode(translatedText);
      el.appendChild(br);
      el.appendChild(textNode);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function processComposeBoxes(root = document) {
    const els = root instanceof Element && root.matches?.(CONFIG.translate.composeSelector)
      ? [root]
      : Array.from(root.querySelectorAll?.(CONFIG.translate.composeSelector) || []);

    els.forEach((el) => {
      if (el.dataset.ttComposeDone) return;
      el.dataset.ttComposeDone = '1';

      const btn = document.createElement('div');
      btn.className = 'tt-compose-btn';
      btn.dataset.ttState = 'idle';
      updateComposeBtnLabel(btn);

      let resultEl = null;

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (translateLangSetting.get() === CONFIG.translate.noneValue) return;

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

      el.insertAdjacentElement('afterend', btn);
    });
  }

  // ============================================================
  // 複数画像のスワイプギャラリー
  // ============================================================

  const GALLERY_CSS = `
    #tweetapp-gallery-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.92);
      z-index: 10001;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      touch-action: none;
    }
    #tweetapp-gallery-track {
      display: flex;
      width: 100%;
      height: 100%;
      transition: transform 0.25s ease-out;
    }
    #tweetapp-gallery-track.tweetapp-gallery-no-transition {
      transition: none;
    }
    .tweetapp-gallery-slide {
      flex: 0 0 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
    }
    .tweetapp-gallery-slide img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    #tweetapp-gallery-close {
      position: absolute;
      top: 16px;
      left: 16px;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(0,0,0,0.5);
      color: #fff;
      border: none;
      font-size: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10002;
    }
    #tweetapp-gallery-counter {
      position: absolute;
      top: 24px;
      left: 50%;
      transform: translateX(-50%);
      color: #fff;
      font-size: 14px;
      background: rgba(0,0,0,0.5);
      padding: 4px 12px;
      border-radius: 12px;
      z-index: 10002;
    }
    .tweetapp-gallery-arrow {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: rgba(0,0,0,0.5);
      color: #fff;
      border: none;
      font-size: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10002;
    }
    #tweetapp-gallery-prev { left: 12px; }
    #tweetapp-gallery-next { right: 12px; }
  `;

  function findGalleryImages(article) {
    // "Attached media" のimgを複数含むグリッドを探す(単一画像は対象外)
    const imgs = Array.from(article.querySelectorAll('img[alt="Attached media"]'));
    return imgs.length >= 2 ? imgs : [];
  }

  function openGallery(images, startIndex) {
    let index = startIndex;

    const overlay = document.createElement('div');
    overlay.id = 'tweetapp-gallery-overlay';

    const track = document.createElement('div');
    track.id = 'tweetapp-gallery-track';

    images.forEach((src) => {
      const slide = document.createElement('div');
      slide.className = 'tweetapp-gallery-slide';
      const img = document.createElement('img');
      img.src = src;
      slide.appendChild(img);
      track.appendChild(slide);
    });

    const closeBtn = document.createElement('button');
    closeBtn.id = 'tweetapp-gallery-close';
    closeBtn.type = 'button';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => overlay.remove());

    const counter = document.createElement('div');
    counter.id = 'tweetapp-gallery-counter';

    const prevBtn = document.createElement('button');
    prevBtn.id = 'tweetapp-gallery-prev';
    prevBtn.className = 'tweetapp-gallery-arrow';
    prevBtn.type = 'button';
    prevBtn.textContent = '‹';

    const nextBtn = document.createElement('button');
    nextBtn.id = 'tweetapp-gallery-next';
    nextBtn.className = 'tweetapp-gallery-arrow';
    nextBtn.type = 'button';
    nextBtn.textContent = '›';

    function render(withTransition) {
      track.classList.toggle('tweetapp-gallery-no-transition', !withTransition);
      track.style.transform = `translateX(-${index * 100}%)`;
      counter.textContent = `${index + 1} / ${images.length}`;
      prevBtn.style.visibility = index === 0 ? 'hidden' : 'visible';
      nextBtn.style.visibility = index === images.length - 1 ? 'hidden' : 'visible';
    }

    function goTo(newIndex, withTransition = true) {
      index = Math.max(0, Math.min(images.length - 1, newIndex));
      render(withTransition);
    }

    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      goTo(index - 1);
    });
    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      goTo(index + 1);
    });

    // スワイプ操作
    let startX = 0;
    let currentX = 0;
    let dragging = false;

    track.addEventListener('pointerdown', (e) => {
      dragging = true;
      startX = e.clientX;
      currentX = e.clientX;
      track.classList.add('tweetapp-gallery-no-transition');
      track.setPointerCapture(e.pointerId);
    });

    track.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      currentX = e.clientX;
      const deltaPct = ((currentX - startX) / window.innerWidth) * 100;
      track.style.transform = `translateX(calc(-${index * 100}% + ${deltaPct}%))`;
    });

    function endDrag() {
      if (!dragging) return;
      dragging = false;
      const deltaX = currentX - startX;
      const threshold = window.innerWidth * 0.15;
      if (deltaX > threshold && index > 0) {
        goTo(index - 1);
      } else if (deltaX < -threshold && index < images.length - 1) {
        goTo(index + 1);
      } else {
        goTo(index);
      }
    }

    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    function handleKeydown(e) {
      if (e.key === 'ArrowLeft') goTo(index - 1);
      else if (e.key === 'ArrowRight') goTo(index + 1);
      else if (e.key === 'Escape') overlay.remove();
    }
    document.addEventListener('keydown', handleKeydown);

    const cleanupObserver = new MutationObserver(() => {
      if (!document.body.contains(overlay)) {
        document.removeEventListener('keydown', handleKeydown);
        cleanupObserver.disconnect();
      }
    });
    cleanupObserver.observe(document.body, { childList: true });

    overlay.appendChild(track);
    overlay.appendChild(closeBtn);
    overlay.appendChild(counter);
    overlay.appendChild(prevBtn);
    overlay.appendChild(nextBtn);
    document.body.appendChild(overlay);

    goTo(index, false);
  }

  function attachGalleryHandlers(article) {
    if (article.dataset.ttGalleryDone) return;

    const imgs = findGalleryImages(article);
    if (imgs.length === 0) return;

    article.dataset.ttGalleryDone = '1';
    const srcs = imgs.map((img) => img.src);

    imgs.forEach((img, i) => {
      img.addEventListener('click', (e) => {
        if (!galleryEnabledSetting.get()) return;
        e.preventDefault();
        e.stopPropagation();
        openGallery(srcs, i);
      }, true);
    });
  }

  function processGalleryArticles(root = document) {
    const articles = root instanceof Element && root.matches?.('article')
      ? [root]
      : Array.from(root.querySelectorAll?.('article') || []);
    articles.forEach(attachGalleryHandlers);
  }

  // ============================================================
  // インラインリプライ欄への@ハンドル自動入力
  // ============================================================

  function extractHandleFromArticle(article) {
    // article直下の投稿者ボタンのみ対象(ネスト返信は除外)
    const btn = article.querySelector(':scope > div.flex.items-start.gap-3 > button[aria-label^="View @"]');
    const label = btn?.getAttribute('aria-label') || '';
    const match = label.match(/^View @(.+?)'s profile$/);
    return match ? match[1] : null;
  }

  function prefillInlineReplyHandles(root = document) {
    if (!replyPrefillEnabledSetting.get()) return;

    const textareas = root instanceof HTMLTextAreaElement && root.name === 'compose-text'
      ? [root]
      : Array.from(root.querySelectorAll?.('textarea[name="compose-text"]') || []);

    textareas.forEach((textarea) => {
      if (textarea.dataset.ttPrefillDone) return;

      const article = textarea.closest('article');
      if (!article) return;

      const handle = extractHandleFromArticle(article);
      if (!handle) return;

      textarea.dataset.ttPrefillDone = '1';
      if (textarea.value.trim() !== '') return;

      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      ).set;
      nativeSetter.call(textarea, `@${handle} `);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));

      // カーソルを末尾に
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    });
  }

  // ============================================================
  // DOM監視（最適化）
  // ============================================================

  function handleAddedNode(node) {
    if (node.nodeType !== 1) return;

    if (node.matches?.('article')) processArticle(node);
    node.querySelectorAll?.('article').forEach(processArticle);

    applyFontSizeToBodies(node);
    applyFontSizeToComposers(node);
    applyAutoplaySetting(node);
    processComposeBoxes(node);
    processGalleryArticles(node);
    prefillInlineReplyHandles(node);
    injectSettingsSection();
  }

  function watchRouteChanges() {
    const origPushState = history.pushState;
    const origReplaceState = history.replaceState;
    history.pushState = function (...args) {
      origPushState.apply(this, args);
      setTimeout(injectSettingsSection, 50);
    };
    history.replaceState = function (...args) {
      origReplaceState.apply(this, args);
      setTimeout(injectSettingsSection, 50);
    };
    window.addEventListener('popstate', () => setTimeout(injectSettingsSection, 50));
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
  // ============================================================

  function init() {
    loadOgpCacheFromStorage();
    applyStyles();
    applyAutoplaySetting();
    startObserving();
    watchRouteChanges();
    document.querySelectorAll('article').forEach(processArticle);
    processComposeBoxes();
    processGalleryArticles();
    prefillInlineReplyHandles();
    injectSettingsSection();

    requestAnimationFrame(() => {
      applyStyles();
      applyAutoplaySetting();
    });
    setTimeout(() => {
      applyStyles();
      applyAutoplaySetting();
    }, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
