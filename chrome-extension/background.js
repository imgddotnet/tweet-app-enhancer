// content.jsからのHTTP取得依頼を中継するservice worker。
// ページのCSP/CORSに縛られず翻訳API・リンク先ページ・Tenor GIFを取得するために使用する。
// message.binary === true の場合は本文を base64 で返す(GIFなどのバイナリ用)。

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'tt-fetch') return false;

  (async () => {
    const res = await fetch(message.url, { credentials: 'omit' });
    const contentType = res.headers.get('content-type') || '';

    if (message.binary) {
      const bytes = new Uint8Array(await res.arrayBuffer());
      let binary = '';
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
      }
      sendResponse({
        status: res.status,
        base64: btoa(binary),
        contentType,
        headers: `content-type: ${contentType}`,
        finalUrl: res.url,
      });
      return;
    }

    const text = await res.text();
    sendResponse({
      status: res.status,
      text,
      headers: `content-type: ${contentType}`,
      finalUrl: res.url,
    });
  })().catch((err) => {
    sendResponse({ error: String(err) });
  });

  return true; // 非同期でsendResponseを呼ぶことを示す
});
