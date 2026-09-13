// content.jsからのfetch依頼を中継するservice worker。
// ページのCSP/CORSに縛られず翻訳API・リンク先ページを取得するために使用する。

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'tt-fetch') return false;

  fetch(message.url)
    .then(async (res) => {
      const text = await res.text();
      sendResponse({ status: res.status, text });
    })
    .catch((err) => {
      sendResponse({ error: String(err) });
    });

  return true; // 非同期でsendResponseを呼ぶことを示す
});
