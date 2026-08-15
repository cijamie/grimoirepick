// BOTC Grimoire Hub Background Service Worker

const DEFAULT_REGISTRY_URL = 'https://raw.githubusercontent.com/cijamie/grimoirepick/main/manifest.json';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_REGISTRY') {
    const url = (message.url || DEFAULT_REGISTRY_URL) + '?t=' + Date.now();
    fetch(url, { cache: 'no-store' })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
      })
      .then(data => sendResponse({ success: true, data }))
      .catch(error => {
        console.error('Error fetching registry:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keeps message channel open for asynchronous sendResponse
  }

  if (message.type === 'FETCH_TEXT') {
    const url = message.url + '?t=' + Date.now();
    fetch(url, { cache: 'no-store' })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.text();
      })
      .then(data => sendResponse({ success: true, data }))
      .catch(error => {
        console.error('Error fetching text:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keeps message channel open for asynchronous sendResponse
  }
});
