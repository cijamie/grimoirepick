// BOTC Grimoire Hub Popup Script

let registry = null;
let activeThemeId = null;
let autoDetectEnabled = true;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Get settings from storage
  chrome.storage.local.get(['autoDetect', 'activeThemeId'], (result) => {
    autoDetectEnabled = result.autoDetect !== false;
    activeThemeId = result.activeThemeId || null;
    
    const toggle = document.getElementById('auto-detect-toggle');
    if (toggle) toggle.checked = autoDetectEnabled;
    
    // 2. Fetch the theme registry
    fetchRegistry();
  });

  // Toggle Auto-detect listener
  const toggle = document.getElementById('auto-detect-toggle');
  if (toggle) {
    toggle.addEventListener('change', (e) => {
      autoDetectEnabled = e.target.checked;
      chrome.storage.local.set({ autoDetect: autoDetectEnabled }, () => {
        notifyActiveTab({ type: 'UPDATE_SETTINGS', autoDetect: autoDetectEnabled });
        renderThemes();
      });
    });
  }

  // Search filter listener
  const searchBox = document.getElementById('search-box');
  if (searchBox) {
    searchBox.addEventListener('input', () => {
      renderThemes();
    });
  }
});

async function fetchRegistry() {
  chrome.runtime.sendMessage({ type: 'FETCH_REGISTRY' }, (response) => {
    if (response && response.success) {
      registry = response.data;
      renderThemes();
    } else {
      const listContainer = document.getElementById('themes-list');
      if (listContainer) {
        listContainer.innerHTML = '<div class="loading">Error loading registry.</div>';
      }
    }
  });
}

function renderThemes() {
  const container = document.getElementById('themes-list');
  if (!container || !registry || !registry.themes) return;
  
  const searchBox = document.getElementById('search-box');
  const query = searchBox ? searchBox.value.toLowerCase().trim() : '';
  
  const filtered = registry.themes.filter(theme => {
    return theme.name.toLowerCase().includes(query) ||
           (theme.author && theme.author.toLowerCase().includes(query)) ||
           (theme.scriptName && theme.scriptName.toLowerCase().includes(query));
  });
  
  if (filtered.length === 0) {
    container.innerHTML = '<div class="loading">No scripts found.</div>';
    return;
  }
  
  container.innerHTML = '';
  
  filtered.forEach(theme => {
    const isActive = theme.id === activeThemeId;
    const card = document.createElement('div');
    card.className = `theme-card ${isActive ? 'active' : ''}`;
    
    let cssButtonHtml = '';
    if (theme.cssUrl) {
      if (isActive) {
        cssButtonHtml = `<button class="btn btn-reset" data-action="reset" style="display: inline-block !important; flex: 1 !important; padding: 6px 12px !important; border: 1px solid #ff3333 !important; color: #ff3333 !important; background: transparent !important; border-radius: 20px !important; font-family: 'Share Tech Mono', monospace !important; font-size: 0.7rem !important; cursor: pointer !important; text-transform: uppercase !important; text-align: center !important; font-weight: 600 !important; letter-spacing: 0.5px !important; height: auto !important; margin: 0 !important;">Reset</button>`;
      } else {
        cssButtonHtml = `<button class="btn btn-primary" data-action="load" ${autoDetectEnabled ? 'disabled title="Disable auto-detection to load manually"' : ''} style="display: inline-block !important; flex: 1 !important; padding: 6px 12px !important; border: 1px solid #00e5ff !important; color: #00e5ff !important; background: transparent !important; border-radius: 20px !important; font-family: 'Share Tech Mono', monospace !important; font-size: 0.7rem !important; cursor: pointer !important; text-transform: uppercase !important; text-align: center !important; font-weight: 600 !important; letter-spacing: 0.5px !important; height: auto !important; margin: 0 !important;">Load CSS</button>`;
      }
    }

    card.innerHTML = `
      <div class="theme-name">
        <span>${theme.name}</span>
        ${isActive ? '<span class="badge">Active</span>' : ''}
      </div>
      <div class="theme-author">By ${theme.author || 'Anonymous'}</div>
      <div class="theme-script" title="${theme.scriptName}">${theme.scriptName || 'No associated script'}</div>
      <div class="card-actions" style="display: flex !important; gap: 10px !important; margin-top: 12px !important; visibility: visible !important;">
        ${cssButtonHtml}
        <button class="btn btn-secondary" data-action="copy" style="display: inline-block !important; flex: 1 !important; padding: 6px 12px !important; border: 1px solid #d4af37 !important; color: #d4af37 !important; background: transparent !important; border-radius: 20px !important; font-family: 'Share Tech Mono', monospace !important; font-size: 0.7rem !important; cursor: pointer !important; text-transform: uppercase !important; text-align: center !important; font-weight: 600 !important; letter-spacing: 0.5px !important; height: auto !important; margin: 0 !important;">Load JSON</button>
      </div>
    `;

    // Diagnostic text after innerHTML is set
    const debugDiv = document.createElement('div');
    debugDiv.style.cssText = "color: #ff3333 !important; font-size: 0.6rem !important; margin-top: 5px !important; font-family: monospace !important; display: block !important;";
    debugDiv.innerText = `DEBUG: ${theme.cssUrl ? 'hasCss' : 'noCss'} | buttons in DOM: ${card.querySelectorAll('button').length}`;
    card.appendChild(debugDiv);
    
    card.querySelector('[data-action="copy"]').addEventListener('click', () => {
      loadScriptJson(theme);
    });
    
    const loadBtn = card.querySelector('[data-action="load"]');
    if (loadBtn) {
      loadBtn.addEventListener('click', () => {
        loadTheme(theme);
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

function loadTheme(theme) {
  activeThemeId = theme.id;
  chrome.storage.local.set({ activeThemeId: theme.id }, () => {
    notifyActiveTab({ type: 'LOAD_THEME', theme: theme });
    renderThemes();
    showToast(`Loaded theme "${theme.name}"`);
  });
}

function resetTheme() {
  activeThemeId = null;
  chrome.storage.local.set({ activeThemeId: null }, () => {
    notifyActiveTab({ type: 'RESET_THEME' });
    renderThemes();
    showToast('Theme reset to default');
  });
}

function loadScriptJson(theme) {
  if (!theme.scriptJsonUrl) return;
  showToast('Loading script JSON...');
  chrome.runtime.sendMessage({ type: 'FETCH_TEXT', url: theme.scriptJsonUrl }, (response) => {
    if (response && response.success) {
      navigator.clipboard.writeText(response.data).then(() => {
        showToast('Script loaded!');
        notifyActiveTab({ type: 'SIMULATE_PASTE', text: response.data });
      }).catch(() => {
        notifyActiveTab({ type: 'SIMULATE_PASTE', text: response.data });
        showToast('Script loaded!');
      });
    } else {
      showToast('Fetch failed');
    }
  });
}

function notifyActiveTab(message) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
        // Suppress errors when content script isn't running on the target page
        if (chrome.runtime.lastError) {
          // ignore
        }
      });
    }
  });
}

let toastTimeout = null;
function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.classList.add('show');
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}
