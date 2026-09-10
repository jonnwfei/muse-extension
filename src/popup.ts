// @author John Cai
// @date 2026-09-10

document.addEventListener("DOMContentLoaded", async () => {
  const downloadBtn = document.getElementById(
    "download-btn",
  ) as HTMLButtonElement;
  const titleEl = document.getElementById("sheet-name") as HTMLAnchorElement;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (tab && tab.id) {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: "GET_TITLE",
      });
      if (response && response.title) {
        titleEl.innerText = response.title;
      }
    } catch (e) {
      console.warn("Content script not found. Is the page refreshed?", e);
      titleEl.innerText = "Unavailable (Refresh page?)";
    }

    downloadBtn.addEventListener("click", async () => {
      try {
        await chrome.tabs.sendMessage(tab.id!, { action: "START_SCRAPING" });
        downloadBtn.style.opacity = "0.5";
        downloadBtn.style.pointerEvents = "none";
      } catch (e) {
        console.error("Failed to send message:", e);
        alert("Error: Please refresh the page and try again.");
      }
    });
  }
});
