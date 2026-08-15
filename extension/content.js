// BOTC Grimoire Hub Content Script

(function () {
  'use strict';

  // State
  let registry = null;
  let activeThemeId = null;
  let autoDetectEnabled = true;
  let lastDetectedScriptName = null;

  // Initialize
  init();

  async function init() {
    try {
      // 1. Load initial settings
      const settings = await getSettings();
      autoDetectEnabled = settings.autoDetect !== false;
      activeThemeId = settings.activeThemeId || null;

      // 2. Fetch the theme registry from background script
      const regResponse = await sendMessageToBackground({ type: 'FETCH_REGISTRY' });
      if (regResponse && regResponse.success) {
        registry = regResponse.data;
      } else {
        console.warn('BOTC Grimoire Hub: Could not load remote registry. Falling back to local/cached.');
        registry = { themes: [] };
      }

      // Check if we are running on the portal website instead of the game page
      const isWebsite = location.hostname !== 'botc.app';
      if (isWebsite) {
        document.documentElement.dataset.botcHubInstalled = "true";

        // Listen for selections from the website UI
        document.addEventListener('botc-hub-load-theme', (e) => {
          const theme = e.detail;
          if (theme) {
            saveSetting('activeThemeId', theme.id);
            saveSetting('autoDetect', false);
            sendMessageToBackground({ type: 'FETCH_TEXT', url: theme.cssUrl });
          }
        });

        document.addEventListener('botc-hub-reset-theme', () => {
          saveSetting('activeThemeId', null);
        });

        console.log('BOTC Grimoire Hub: Website communication helper active.');
        return; // Terminate execution early for web pages
      }

      // 3. Inject styling for the extension container
      injectExtensionStyles();

      // 4. Create and inject the floating UI
      createFloatingUI();

      // 5. Apply active theme if selected manually
      if (!autoDetectEnabled && activeThemeId) {
        const theme = registry.themes.find(t => t.id === activeThemeId);
        if (theme) {
          loadThemeCSS(theme);
        }
      }

      // 6. Start the auto-detection scanner loop
      startAutoDetectScanner();

      // 7. Listen for messages from the popup script
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'LOAD_THEME') {
          loadThemeCSS(message.theme);
          sendResponse({ success: true });
        } else if (message.type === 'RESET_THEME') {
          resetTheme();
          sendResponse({ success: true });
        } else if (message.type === 'UPDATE_SETTINGS') {
          autoDetectEnabled = message.autoDetect;
          const toggleInput = shadowRootElement ? shadowRootElement.querySelector('#auto-detect-toggle') : null;
          if (toggleInput) toggleInput.checked = autoDetectEnabled;
          if (autoDetectEnabled) {
            lastDetectedScriptName = null; // force check
          }
          updateUIState();
          sendResponse({ success: true });
        }
      });

      console.log('BOTC Grimoire Hub initialized successfully!');
    } catch (e) {
      console.error('BOTC Grimoire Hub: Initialization failed:', e);
    }
  }

  // --- Chrome Storage Settings Helpers ---
  function getSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['autoDetect', 'activeThemeId'], (result) => {
        resolve(result);
      });
    });
  }

  function saveSetting(key, value) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, () => {
        resolve();
      });
    });
  }

  // --- Message Communication Helper ---
  function sendMessageToBackground(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        resolve(response);
      });
    });
  }

  // --- CSS Theme Injection ---
  async function loadThemeCSS(theme) {
    if (!theme.cssUrl) return;

    try {
      showToast(`Loading theme: ${theme.name}...`);
      const response = await sendMessageToBackground({ type: 'FETCH_TEXT', url: theme.cssUrl });
      if (response && response.success) {
        let styleTag = document.getElementById('botc-grimoire-hub-theme');
        if (!styleTag) {
          styleTag = document.createElement('style');
          styleTag.id = 'botc-grimoire-hub-theme';
          document.documentElement.appendChild(styleTag);
        }
        styleTag.textContent = response.data;
        activeThemeId = theme.id;
        saveSetting('activeThemeId', theme.id);
        updateUIState();
        showToast(`Theme "${theme.name}" loaded successfully!`);
      } else {
        throw new Error(response.error || 'Unknown fetch error');
      }
    } catch (err) {
      console.error('Failed to load theme CSS:', err);
      showToast(`Error loading theme: ${err.message}`, true);
    }
  }

  function resetTheme() {
    const styleTag = document.getElementById('botc-grimoire-hub-theme');
    if (styleTag) {
      styleTag.textContent = '';
    }
    activeThemeId = null;
    saveSetting('activeThemeId', null);
    updateUIState();
    showToast('Theme reset to default.');
  }

  // --- Copy Script JSON ---
  async function copyScriptJson(theme) {
    if (!theme.scriptJsonUrl) return;

    try {
      showToast('Fetching script JSON...');
      const response = await sendMessageToBackground({ type: 'FETCH_TEXT', url: theme.scriptJsonUrl });
      if (response && response.success) {
        navigator.clipboard.writeText(response.data).then(() => {
          showToast(`Script JSON for "${theme.name}" copied to clipboard!`);
        }).catch(err => {
          throw new Error('Clipboard access denied');
        });
      } else {
        throw new Error(response.error || 'Failed to fetch');
      }
    } catch (err) {
      console.error('Failed to copy script JSON:', err);
      showToast(`Error copying JSON: ${err.message}`, true);
    }
  }

  // --- Auto Detection Loop ---
  function startAutoDetectScanner() {
    setInterval(() => {
      if (!autoDetectEnabled || !registry || !registry.themes) return;

      const detected = scanForActiveScript();
      if (detected !== lastDetectedScriptName) {
        lastDetectedScriptName = detected;
        if (detected) {
          console.log(`BOTC Grimoire Hub: Detected script "${detected}"`);
          const matchedTheme = registry.themes.find(t => t.scriptName === detected);
          if (matchedTheme) {
            if (activeThemeId !== matchedTheme.id) {
              showToast(`Auto-detected script: "${detected}". Loading theme...`);
              loadThemeCSS(matchedTheme);
            }
          } else {
            console.log(`No registered theme matches script name: "${detected}"`);
            // If we detected a script but it has no theme, clear the theme
            if (activeThemeId) {
              resetTheme();
            }
          }
        } else {
          // No custom script detected, reset theme if we had one applied via auto-detect
          if (activeThemeId) {
            resetTheme();
          }
        }
      }
    }, 2500);
  }

  function scanForActiveScript() {
    if (!registry || !registry.themes) return null;
    const scriptNames = registry.themes.map(t => t.scriptName).filter(Boolean);
    if (scriptNames.length === 0) return null;

    function searchNode(node) {
      // Exclude script, style, metadata tags
      if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = node.tagName.toLowerCase();
        if (tag === 'script' || tag === 'style' || tag === 'svg' || tag === 'path' || tag === 'iframe') {
          return null;
        }
      }

      // Check text node content
      if (node.nodeType === Node.TEXT_NODE) {
        const textVal = node.nodeValue.trim();
        if (textVal) {
          for (const name of scriptNames) {
            if (textVal === name || textVal.includes(name)) {
              return name;
            }
          }
        }
      }

      // Pierce shadow roots recursively
      if (node.shadowRoot) {
        const found = searchNode(node.shadowRoot);
        if (found) return found;
      }

      // Traverse children
      let child = node.firstChild;
      while (child) {
        const found = searchNode(child);
        if (found) return found;
        child = child.nextSibling;
      }

      return null;
    }

    return searchNode(document.body);
  }

  // --- Sleek Injected Floating UI Drawer ---
  let shadowRootElement = null;

  function injectExtensionStyles() {
    // We append a basic container in the page for our shadow host
    let container = document.getElementById('botc-grimoire-hub-root');
    if (!container) {
      container = document.createElement('div');
      container.id = 'botc-grimoire-hub-root';
      document.body.appendChild(container);
    }
  }

  function createFloatingUI() {
    const container = document.getElementById('botc-grimoire-hub-root');
    if (!container) return;

    // Attach Shadow DOM for encapsulation
    const shadow = container.attachShadow({ mode: 'open' });
    shadowRootElement = shadow;

    // Injected UI styling (Isolated from parent page)
    const style = document.createElement('style');
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Teko:wght@500;700&display=swap');

      :host {
        all: initial;
        font-family: 'Share Tech Mono', monospace;
      }

      /* Floating Button */
      .floating-btn {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 50px;
        height: 50px;
        border-radius: 50%;
        background: #0f172a;
        border: 2px solid #00e5ff;
        box-shadow: 0 0 15px rgba(0, 229, 255, 0.4);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999999;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .floating-btn:hover {
        transform: scale(1.1) rotate(10deg);
        box-shadow: 0 0 25px rgba(0, 229, 255, 0.7);
        border-color: #ff3333;
      }
      .floating-btn svg {
        width: 26px;
        height: 26px;
        fill: #00e5ff;
        transition: fill 0.3s;
      }
      .floating-btn:hover svg {
        fill: #ff3333;
      }

      /* Side Drawer */
      .drawer {
        position: fixed;
        top: 0;
        right: -360px;
        width: 340px;
        height: 100vh;
        background: rgba(10, 14, 23, 0.96);
        border-left: 2px solid #d4af37;
        box-shadow: -5px 0 25px rgba(0, 0, 0, 0.8);
        z-index: 999998;
        transition: right 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        display: flex;
        flex-direction: column;
        color: #ffffff;
        box-sizing: border-box;
      }
      .drawer.open {
        right: 0;
      }

      /* Drawer Header */
      .drawer-header {
        padding: 20px;
        border-bottom: 1px solid rgba(212, 175, 55, 0.3);
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: #07090e;
      }
      .drawer-title {
        font-family: 'Teko', sans-serif;
        font-size: 2rem;
        letter-spacing: 2px;
        color: #d4af37;
        margin: 0;
        text-transform: uppercase;
        line-height: 1;
      }
      .close-btn {
        background: none;
        border: none;
        color: #90a4ae;
        font-size: 1.5rem;
        cursor: pointer;
        transition: color 0.2s;
      }
      .close-btn:hover {
        color: #ff3333;
      }

      /* Controls Section */
      .drawer-controls {
        padding: 15px 20px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(15, 23, 42, 0.4);
      }
      .toggle-container {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 15px;
        font-size: 0.85rem;
        color: #cfd8dc;
      }
      .switch {
        position: relative;
        display: inline-block;
        width: 44px;
        height: 22px;
      }
      .switch input {
        opacity: 0;
        width: 0;
        height: 0;
      }
      .slider {
        position: absolute;
        cursor: pointer;
        top: 0; left: 0; right: 0; bottom: 0;
        background-color: #374151;
        transition: .3s;
        border-radius: 22px;
        border: 1px solid rgba(212, 175, 55, 0.2);
      }
      .slider:before {
        position: absolute;
        content: "";
        height: 14px;
        width: 14px;
        left: 3px;
        bottom: 3px;
        background-color: #cfd8dc;
        transition: .3s;
        border-radius: 50%;
      }
      input:checked + .slider {
        background-color: rgba(0, 229, 255, 0.2);
        border-color: #00e5ff;
      }
      input:checked + .slider:before {
        transform: translateX(22px);
        background-color: #00e5ff;
        box-shadow: 0 0 8px #00e5ff;
      }

      .search-box {
        width: 100%;
        box-sizing: border-box;
        background: #07090e;
        border: 1px solid rgba(212, 175, 55, 0.3);
        color: #ffffff;
        padding: 8px 12px;
        font-family: 'Share Tech Mono', monospace;
        font-size: 0.85rem;
        border-radius: 4px;
        outline: none;
        transition: border-color 0.2s;
      }
      .search-box:focus {
        border-color: #00e5ff;
        box-shadow: 0 0 6px rgba(0, 229, 255, 0.2);
      }

      /* Card List */
      .theme-list {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 15px;
      }
      .theme-card {
        background: rgba(13, 18, 29, 0.7);
        border: 1px solid rgba(212, 175, 55, 0.15);
        border-radius: 6px;
        padding: 15px;
        transition: all 0.25s;
        position: relative;
        overflow: hidden;
      }
      .theme-card:hover {
        border-color: #d4af37;
        background: rgba(13, 18, 29, 0.95);
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4);
      }
      .theme-card.active {
        border-color: #00e5ff;
        background: rgba(13, 18, 29, 0.9);
        box-shadow: 0 0 10px rgba(0, 229, 255, 0.15);
      }
      .theme-card.active::before {
        content: "";
        position: absolute;
        top: 0; left: 0; width: 4px; height: 100%;
        background: #00e5ff;
        box-shadow: 0 0 8px #00e5ff;
      }
      .theme-name {
        font-family: 'Teko', sans-serif;
        font-size: 1.5rem;
        margin: 0 0 4px 0;
        letter-spacing: 1px;
        color: #ffffff;
        text-transform: uppercase;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .theme-author {
        font-size: 0.75rem;
        color: #90a4ae;
        margin-bottom: 12px;
      }
      .theme-script {
        font-size: 0.75rem;
        color: #cfd8dc;
        border-left: 2px solid rgba(212, 175, 55, 0.4);
        padding-left: 8px;
        margin-bottom: 15px;
        font-style: italic;
      }
      
      /* Card Buttons */
      .card-actions {
        display: flex;
        gap: 8px;
      }
      .btn {
        flex: 1;
        padding: 6px 10px;
        font-family: 'Share Tech Mono', monospace;
        font-size: 0.75rem;
        border-radius: 4px;
        cursor: pointer;
        border: 1px solid;
        text-transform: uppercase;
        transition: all 0.2s;
        text-align: center;
      }
      .btn-primary {
        background: #07090e;
        border-color: #00e5ff;
        color: #00e5ff;
      }
      .btn-primary:hover {
        background: #00e5ff;
        color: #07090e;
        box-shadow: 0 0 8px rgba(0, 229, 255, 0.4);
      }
      .btn-secondary {
        background: #07090e;
        border-color: #d4af37;
        color: #d4af37;
      }
      .btn-secondary:hover {
        background: #d4af37;
        color: #07090e;
        box-shadow: 0 0 8px rgba(212, 175, 55, 0.4);
      }
      .btn-reset {
        background: #07090e;
        border-color: #ff3333;
        color: #ff3333;
      }
      .btn-reset:hover {
        background: #ff3333;
        color: #ffffff;
        box-shadow: 0 0 8px rgba(255, 51, 81, 0.4);
      }

      .badge {
        font-size: 0.65rem;
        background: rgba(0, 229, 255, 0.15);
        color: #00e5ff;
        border: 1px solid #00e5ff;
        padding: 1px 6px;
        border-radius: 3px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      /* Scrollbar */
      .theme-list::-webkit-scrollbar {
        width: 4px;
      }
      .theme-list::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.2);
      }
      .theme-list::-webkit-scrollbar-thumb {
        background: rgba(212, 175, 55, 0.3);
        border-radius: 2px;
      }
      .theme-list::-webkit-scrollbar-thumb:hover {
        background: #00e5ff;
      }

      /* Toasts */
      .toast {
        position: fixed;
        bottom: 85px;
        right: 20px;
        background: #0e1420;
        border: 1px solid #d4af37;
        color: #ffffff;
        padding: 10px 18px;
        font-size: 0.8rem;
        border-radius: 4px;
        box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
        z-index: 999999;
        transform: translateY(20px);
        opacity: 0;
        transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        pointer-events: none;
      }
      .toast.show {
        transform: translateY(0);
        opacity: 1;
      }
      .toast.error {
        border-color: #ff3333;
        color: #ff8888;
      }
    `;
    shadow.appendChild(style);

    // Floating Button Element
    const floatBtn = document.createElement('button');
    floatBtn.className = 'floating-btn';
    floatBtn.title = 'BOTC Grimoire Hub';
    floatBtn.innerHTML = `
      <svg viewBox="0 0 24 24">
        <path d="M12 2S4.5 8.5 4.5 13S8 21 12 21s7.5-3.5 7.5-8S12 2 12 2zm0 16c-2.8 0-5-2.2-5-5c0-1.8 1.2-3.8 2.6-5.1c.9-.8 1.9-1.4 2.4-1.8c.5.4 1.5 1 2.4 1.8c1.4 1.3 2.6 3.3 2.6 5.1c0 2.8-2.2 5-5 5z"/>
      </svg>
    `;
    shadow.appendChild(floatBtn);

    // Drawer Interface Element
    const drawer = document.createElement('div');
    drawer.className = 'drawer';
    drawer.innerHTML = `
      <div class="drawer-header">
        <h2 class="drawer-title">Grimoire Hub</h2>
        <button class="close-btn">&times;</button>
      </div>
      <div class="drawer-controls">
        <div class="toggle-container">
          <span>Auto-detect theme from game</span>
          <label class="switch">
            <input type="checkbox" id="auto-detect-toggle" ${autoDetectEnabled ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
        </div>
        <input type="text" class="search-box" placeholder="Search scripts & themes...">
      </div>
      <div class="theme-list" id="theme-list-container">
        <!-- Rendered dynamically -->
      </div>
    `;
    shadow.appendChild(drawer);

    // Toast element
    const toast = document.createElement('div');
    toast.className = 'toast';
    shadow.appendChild(toast);

    // Event Listeners
    floatBtn.addEventListener('click', () => {
      drawer.classList.toggle('open');
    });

    drawer.querySelector('.close-btn').addEventListener('click', () => {
      drawer.classList.remove('open');
    });

    const searchBox = drawer.querySelector('.search-box');
    searchBox.addEventListener('input', () => {
      renderThemes(searchBox.value);
    });

    const toggle = drawer.querySelector('#auto-detect-toggle');
    toggle.addEventListener('change', (e) => {
      autoDetectEnabled = e.target.checked;
      saveSetting('autoDetect', autoDetectEnabled);
      if (autoDetectEnabled) {
        showToast('Auto-detection enabled. Checking active script...');
        lastDetectedScriptName = null; // force rerun
      } else {
        showToast('Auto-detection disabled.');
      }
      renderThemes(searchBox.value);
    });

    // Initial render
    renderThemes();
  }

  // --- Render catalog cards ---
  function renderThemes(searchQuery = '') {
    if (!shadowRootElement) return;
    const container = shadowRootElement.querySelector('#theme-list-container');
    if (!container) return;

    if (!registry || !registry.themes || registry.themes.length === 0) {
      container.innerHTML = `<div style="text-align: center; color: #90a4ae; padding: 20px; font-size: 0.8rem;">No themes loaded.</div>`;
      return;
    }

    const query = searchQuery.toLowerCase().trim();
    const filteredThemes = registry.themes.filter(theme => {
      return theme.name.toLowerCase().includes(query) ||
             (theme.author && theme.author.toLowerCase().includes(query)) ||
             (theme.scriptName && theme.scriptName.toLowerCase().includes(query));
    });

    container.innerHTML = '';

    filteredThemes.forEach(theme => {
      const isActive = theme.id === activeThemeId;
      const card = document.createElement('div');
      card.className = `theme-card ${isActive ? 'active' : ''}`;
      
      card.innerHTML = `
        <div class="theme-name">
          <span>${theme.name}</span>
          ${isActive ? '<span class="badge">Active</span>' : ''}
        </div>
        <div class="theme-author">By ${theme.author || 'Anonymous'}</div>
        <div class="theme-script">${theme.scriptName || 'No associated script name'}</div>
        <div class="card-actions">
          ${isActive 
            ? `<button class="btn btn-reset" data-action="reset">Reset</button>` 
            : `<button class="btn btn-primary" data-action="load" ${autoDetectEnabled ? 'disabled title="Disable Auto-detect to load manually"' : ''}>Load</button>`
          }
          <button class="btn btn-secondary" data-action="copy">Copy JSON</button>
        </div>
      `;

      // Event handlers for card buttons
      card.querySelector('[data-action="copy"]').addEventListener('click', () => {
        copyScriptJson(theme);
      });

      const loadBtn = card.querySelector('[data-action="load"]');
      if (loadBtn) {
        loadBtn.addEventListener('click', () => {
          loadThemeCSS(theme);
        });
      }

      const resetBtn = card.querySelector('[data-action="reset"]');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          resetTheme();
        });
      }

      container.appendChild(card);
    });
  }

  function updateUIState() {
    renderThemes(shadowRootElement ? shadowRootElement.querySelector('.search-box').value : '');
  }

  // --- Sleek Toast Notifications ---
  let toastTimeout = null;
  function showToast(message, isError = false) {
    if (!shadowRootElement) return;
    const toast = shadowRootElement.querySelector('.toast');
    if (!toast) return;

    clearTimeout(toastTimeout);
    toast.textContent = message;
    
    if (isError) {
      toast.classList.add('error');
    } else {
      toast.classList.remove('error');
    }

    toast.classList.add('show');
    toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 3500);
  }

})();
