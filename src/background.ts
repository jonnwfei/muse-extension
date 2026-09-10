// @author John Cai
// @date 2026-09-10

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === "FETCH_IMAGE") {
    fetch(request.url)
      .then((res) =>
        Promise.all([res.arrayBuffer(), res.headers.get("content-type")]),
      )
      .then(([buffer, contentType]) => {
        // Convert ArrayBuffer to a standard Array to safely pass via Chrome Messaging
        const array = Array.from(new Uint8Array(buffer));
        sendResponse({ success: true, array, contentType });
      })
      .catch((err) => {
        sendResponse({ success: false, error: err.message });
      });

    // We MUST return true here because the fetch is asynchronous
    return true;
  }
  return false;
});
