// ==UserScript==
// @name         Tweet.app Enhancer
// @namespace    https://imgd.net/
// @version      1.6.0
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

  // CONFIG
  const CONFIG = {
    font: {
      key: 'tweetapp_article_zoom_pct',
      default: 100,
      presets: [
        { pct: 100, label: '100% (Default)' },
        { pct: 110, label: '110%' },
        { pct: 120, label: '120%' },
        { pct: 125, label: '125%' },
        { pct: 130, label: '130%' },
        { pct: 150, label: '150%' },
      ],
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
    },
    replyPrefill: {
      enabledKey: 'tweetapp_reply_prefill_enabled',
      enabledDefault: false,
    },
    gallery: {
      enabledKey: 'tweetapp_gallery_enabled',
      enabledDefault: false,
    },
    notificationToast: {
      enabledKey: 'tweetapp_notification_toast_enabled',
      enabledDefault: false,
      pollIntervalMs: 3000,
      displayMs: 4000,
      soundKey: 'tweetapp_notification_sound',
      soundDefault: 'chime',
      sounds: ['none', 'chime', 'drop', 'marimba', 'bell'],
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

  // Settings State
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
  const galleryEnabledSetting = createSetting(CONFIG.gallery.enabledKey, CONFIG.gallery.enabledDefault, () => {});
  const notificationToastEnabledSetting = createSetting(CONFIG.notificationToast.enabledKey, CONFIG.notificationToast.enabledDefault, () => {});
  const notificationSoundSetting = createSetting(CONFIG.notificationToast.soundKey, CONFIG.notificationToast.soundDefault, () => {});

  // Video / GIF Autoplay
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
      if (!isTrackedVideo(video) || autoplayEnabledSetting.get() || userTouchedVideos.has(video)) return;
      video.pause();
      video.autoplay = false;
      video.removeAttribute('autoplay');
    },
    true
  );

  // CSS Styles
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
    .tt-settings-select {
      font-size: 13px;
      font-weight: 700;
      padding: 6px 12px;
      border-radius: 9999px;
      border: 1px solid var(--color-tl-app-border, #d1d5db);
      background: var(--color-tl-app-card, transparent);
      color: var(--color-tl-app-text-muted, #64748b);
      cursor: pointer;
      outline: none;
    }
    .tt-settings-select option {
      background: var(--color-tl-app-card, #ffffff);
      color: var(--color-tl-app-text, #0f1419);
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

  function applyStyles() {
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'tweetapp-appearance-style';
      if (document.documentElement) document.documentElement.appendChild(styleEl);
    }

    const zoomPct = fontSizeSetting.get();
    const mediaPct = mediaPctSetting.get();
    const composerVisible = composerVisibleSetting.get();
    const onSettingsPage = location.pathname.startsWith('/settings');

    styleEl.textContent = `
      article,
      div:has(> textarea) {
        zoom: ${zoomPct}% !important;
      }

      ${onSettingsPage ? '' : `
      div.rounded-2xl.overflow-hidden,
      div.${CONFIG.linkCard.className} {
        width: ${mediaPct}% !important;
        margin-left: auto !important;
        margin-right: auto !important;
      }`}

      ${composerVisible ? '' : `
      ${CONFIG.composer.containerSelector} {
        display: none !important;
      }`}

      ${TRANSLATE_BTN_CSS}
      ${GALLERY_CSS}
      ${SETTINGS_PANEL_CSS}
      ${NOTIFICATION_TOAST_CSS}
    `;
  }

  function clearOgpCache() {
    GM_setValue(CONFIG.linkCard.cacheKey, {});
    ogpCache.clear();
    alert('Link card cache cleared');
  }

  // Settings Panel UI
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

  function createSelectControl(options, setting, parseFn = (v) => v) {
    const select = document.createElement('select');
    select.className = 'tt-settings-select';

    options.forEach(({ value, label }) => {
      const opt = document.createElement('option');
      opt.value = String(value);
      opt.textContent = label;
      select.appendChild(opt);
    });

    select.value = String(setting.get());
    select.addEventListener('change', (e) => setting.set(parseFn(e.target.value)));

    return { el: select };
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

    // Article & Compose zoom
    const fontSizeCtrl = createSelectControl(
      CONFIG.font.presets.map((item) => ({ value: item.pct, label: item.label })),
      fontSizeSetting,
      Number
    );
    card.appendChild(createSettingsRow('Article & Compose zoom', 'Zoom level for tweet articles and compose boxes (%)', fontSizeCtrl.el));

    // Content width
    const mediaWidthCtrl = createSelectControl(
      CONFIG.media.presets.map((m) => ({ value: m.pct, label: `${m.label} (${m.pct}%)` })),
      mediaPctSetting,
      Number
    );
    card.appendChild(createSettingsRow('Content width', 'Width of media and content area', mediaWidthCtrl.el));

    // Reply @handle prefill
    const replyPrefillToggle = createToggleControl(replyPrefillEnabledSetting, 'ON', 'OFF');
    card.appendChild(createSettingsRow('Reply @handle prefill', 'Prefill @handle when replying inline to a tweet', replyPrefillToggle.el));

    // Translate target language
    const translateCtrl = createSelectControl(
      CONFIG.translate.langs.map(([code, label]) => ({ value: code, label })),
      translateLangSetting
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

    // Notification toast & sound
    const notificationToastToggle = createToggleControl(notificationToastEnabledSetting, 'ON', 'OFF');
    card.appendChild(createSettingsRow('Notification popup', 'Show a popup when your notification count increases', notificationToastToggle.el));

    const notificationSoundCtrl = createSelectControl(
      CONFIG.notificationToast.sounds.map((s) => ({
        value: s,
        label: s.charAt(0).toUpperCase() + s.slice(1),
      })),
      notificationSoundSetting
    );
    card.appendChild(createSettingsRow('Notification sound', 'Sound to play with the notification popup', notificationSoundCtrl.el));

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
    if (!location.pathname.startsWith('/settings') || document.getElementById('tweetapp-enhancements-section')) return;

    const displayHeading = Array.from(document.querySelectorAll('h4')).find(
      (h) => h.textContent.trim() === 'Display'
    );
    const container = displayHeading?.closest('.flex.flex-col.gap-5');
    if (container) container.appendChild(buildSettingsSection());
  }

  // Notifications
  let lastNotificationCount = null;
  let audioCtx = null;

  function unlockAudio() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  }

  ['pointerdown', 'keydown', 'touchstart'].forEach((eventName) => {
    document.addEventListener(eventName, unlockAudio, { capture: true, once: true, passive: true });
  });

  function ensureAudioCtx() {
    return audioCtx?.state === 'running' ? audioCtx : null;
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

  function playMarimbaNote(ctx, freq, startTime, gain = 0.3) {
    [1, 4, 10].forEach((harmonic, i) => {
      const g = gain / (i + 1);
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.connect(env);
      env.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * harmonic, startTime);
      env.gain.setValueAtTime(0, startTime);
      env.gain.linearRampToValueAtTime(g, startTime + 0.005);
      env.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5 / harmonic);
      osc.start(startTime);
      osc.stop(startTime + 0.7);
    });
  }

  function playBellNote(ctx, freq, startTime, gain = 0.25) {
    [1, 2.756, 5.404, 7].forEach((ratio, i) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.connect(env);
      env.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * ratio, startTime);
      const g = gain / (i * 0.8 + 1);
      env.gain.setValueAtTime(0, startTime);
      env.gain.linearRampToValueAtTime(g, startTime + 0.005);
      env.gain.exponentialRampToValueAtTime(0.001, startTime + 1.2 - i * 0.2);
      osc.start(startTime);
      osc.stop(startTime + 1.5);
    });
  }

  const SOUND_PLAYERS = {
    none: () => {},
    chime: () => {
      const ctx = ensureAudioCtx(); if (!ctx) return;
      const t = ctx.currentTime;
      [261.63, 329.63, 392.00].forEach((freq, i) => playTone(ctx, freq, t + i * 0.12, 0.35));
    },
    drop: () => {
      const ctx = ensureAudioCtx(); if (!ctx) return;
      playTone(ctx, 880, ctx.currentTime, 0.18, 0.3);
    },
    marimba: () => {
      const ctx = ensureAudioCtx(); if (!ctx) return;
      const t = ctx.currentTime;
      playMarimbaNote(ctx, 392.00, t);
      playMarimbaNote(ctx, 329.63, t + 0.15);
    },
    bell: () => {
      const ctx = ensureAudioCtx(); if (!ctx) return;
      const t = ctx.currentTime;
      playBellNote(ctx, 329.63, t);
      playBellNote(ctx, 392.00, t + 0.18, 0.2);
    },
  };

  function playNotificationSound() {
    try { SOUND_PLAYERS[notificationSoundSetting.get()]?.(); } catch (e) {}
  }

  function findNotificationBadge() {
    const label = Array.from(document.querySelectorAll('span, div')).find(
      (el) => el.children.length === 0 && el.textContent.trim() === 'Notifications'
    );
    return label?.closest('a, button')?.querySelector('span.rounded-full') || null;
  }

  function getNotificationBadgeCount() {
    const badge = findNotificationBadge();
    if (!badge) return 0;
    const count = parseInt(badge.textContent.trim(), 10);
    return Number.isNaN(count) ? 0 : count;
  }

  function showNotificationToast(delta) {
    document.querySelectorAll('.tt-notification-toast').forEach((el) => el.remove());

    const toast = document.createElement('div');
    toast.className = 'tt-notification-toast';
    toast.textContent = delta === 1 ? 'You have a new notification!' : `You have ${delta} new notifications!`;
    document.body.appendChild(toast);

    playNotificationSound();

    requestAnimationFrame(() => toast.classList.add('tt-toast-show'));
    setTimeout(() => {
      toast.classList.remove('tt-toast-show');
      setTimeout(() => toast.remove(), 250);
    }, CONFIG.notificationToast.displayMs);
  }

  function checkNotificationCount() {
    if (!notificationToastEnabledSetting.get()) return;
    const current = getNotificationBadgeCount();
    if (lastNotificationCount === null) {
      lastNotificationCount = current;
      return;
    }
    if (current > lastNotificationCount) showNotificationToast(current - lastNotificationCount);
    lastNotificationCount = current;
  }

  function startNotificationPolling() {
    setInterval(checkNotificationCount, CONFIG.notificationToast.pollIntervalMs);
  }

  // OGP Link Cards
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
        } catch (e) { cb(null); }
      },
      onerror: () => cb(null),
    });
  }

  function parseOgpFromHtml(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const getMeta = (prop) =>
      doc.querySelector(`meta[property="${prop}"]`)?.content || doc.querySelector(`meta[name="${prop}"]`)?.content || '';

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

      if (!linkCardEnabledSetting.get() || !data || article.querySelector('[data-ogp-card]')) return;
      article.querySelector('p')?.insertAdjacentElement('afterend', buildLinkCard(data, url));
    });
  }

  // Compose Translation
  function buildTranslateUrl(endpoint, text, lang) {
    const base = endpoint === 'primary'
      ? 'https://translate.googleapis.com/translate_a/single?client=gtx&dt=t'
      : 'https://clients5.google.com/translate_a/t?client=dict-chrome-ex';
    return `${base}&sl=auto&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(text)}`;
  }

  function parseTranslateResponse(endpoint, responseText) {
    const data = JSON.parse(responseText);
    if (endpoint === 'primary') return data[0].map((seg) => seg[0]).join('');
    if (Array.isArray(data) && Array.isArray(data[0])) return data[0][0];
    if (Array.isArray(data) && typeof data[0] === 'string') return data[0];
    if (data.sentences) return data.sentences.map((s) => s.trans).join('');
    throw new Error('unexpected format');
  }

  function requestTranslateOnce(endpoint, text, lang, onSuccess, onFail) {
    GM_xmlhttpRequest({
      method: 'GET',
      url: buildTranslateUrl(endpoint, text, lang),
      onload: (res) => {
        if (res.status < 200 || res.status >= 300) return onFail(res.status, res.responseText);
        try { onSuccess(parseTranslateResponse(endpoint, res.responseText)); } catch (err) { onFail('parse', res.responseText); }
      },
      onerror: (err) => onFail('network', err),
      ontimeout: () => onFail('timeout', null),
    });
  }

  function callTranslateApi(text, lang, onSuccess, onFail) {
    requestTranslateOnce('primary', text, lang, onSuccess, (status) => {
      if (status === 429) {
        requestTranslateOnce('fallback', text, lang, onSuccess, (status2) => {
          onFail(status2 === 429 ? 'Rate limited — please wait a moment' : 'HTTP ' + status2);
        });
      } else {
        onFail(status === 'parse' ? 'Parse error' : status === 'network' ? 'Network error' : status === 'timeout' ? 'Timeout' : 'HTTP ' + status);
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
    btn.textContent = btn.dataset.ttState === 'loading' ? `🌐 Translating... (${lang})` : `🌐 Insert translation (${lang})`;
  }

  function refreshAllTranslateBtnLabels() {
    document.querySelectorAll('.tt-compose-btn').forEach(updateComposeBtnLabel);
  }

  function insertTranslationIntoCompose(el, translatedText) {
    if (el.tagName === 'TEXTAREA') {
      const current = el.value;
      const sep = current.endsWith('\n') || current === '' ? '' : '\n';
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
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

  function processComposeBoxes(root = document) {
    const els = collectMatching(root, CONFIG.translate.composeSelector);

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

        callTranslateApi(
          text,
          translateLangSetting.get(),
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

  // Swipe Gallery
  function findGalleryImages(article) {
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

    prevBtn.addEventListener('click', (e) => { e.stopPropagation(); goTo(index - 1); });
    nextBtn.addEventListener('click', (e) => { e.stopPropagation(); goTo(index + 1); });

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
      if (deltaX > threshold && index > 0) goTo(index - 1);
      else if (deltaX < -threshold && index < images.length - 1) goTo(index + 1);
      else goTo(index);
    }

    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);

    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

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
    collectMatching(root, 'article').forEach(attachGalleryHandlers);
  }

  // Reply Prefill
  function extractHandleFromLabel(label) {
    const match = label.match(/^View @(.+?)(?:'s|'s) profile$/);
    return match ? match[1] : null;
  }

  function findHandleForTextarea(textarea) {
    const article = textarea.closest('article');
    if (article) {
      const btn = article.querySelector(':scope > div.flex.items-start.gap-3 > button[aria-label^="View @"]');
      const handle = extractHandleFromLabel(btn?.getAttribute('aria-label') || '');
      if (handle) return handle;
    }

    const form = textarea.closest('[role="form"]');
    if (form) {
      let el = form.parentElement;
      while (el && el !== document.body) {
        const btn = el.querySelector('button[aria-label^="View @"]');
        if (btn) {
          const handle = extractHandleFromLabel(btn.getAttribute('aria-label') || '');
          if (handle) return handle;
        }
        el = el.parentElement;
      }
    }

    return null;
  }

  function prefillInlineReplyHandles(root = document) {
    if (!replyPrefillEnabledSetting.get()) return;

    const textareas =
      root instanceof HTMLTextAreaElement && root.name === 'compose-text'
        ? [root]
        : Array.from(root.querySelectorAll?.('textarea[name="compose-text"]') || []);

    textareas.forEach((textarea) => {
      if (textarea.dataset.ttPrefillDone) return;

      const handle = findHandleForTextarea(textarea);
      if (!handle) return;

      textarea.dataset.ttPrefillDone = '1';
      if (textarea.value.trim() !== '') return;

      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      nativeSetter.call(textarea, `@${handle} `);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    });
  }

  // DOM Observer & Route Handling
  function handleAddedNode(node) {
    if (node.nodeType !== 1) return;

    if (node.matches?.('article')) processArticle(node);
    node.querySelectorAll?.('article').forEach(processArticle);

    applyAutoplaySetting(node);
    processComposeBoxes(node);
    processGalleryArticles(node);
    prefillInlineReplyHandles(node);
    injectSettingsSection();
  }

  function handleRouteChange() {
    applyStyles();
    injectSettingsSection();
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
    window.addEventListener('popstate', () => setTimeout(handleRouteChange, 50));
  }

  function startObserving() {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach(handleAddedNode);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Init
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
    startNotificationPolling();

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
