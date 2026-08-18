// BOTC Grimoire Hub Website Script

let registry = null;
let activeThemeId = null;

document.addEventListener('DOMContentLoaded', () => {
  // 1. Fetch registry
  fetchRegistry();

  // 2. Set up search filtering
  const searchBar = document.getElementById('search-bar');
  if (searchBar) {
    searchBar.addEventListener('input', () => {
      renderThemes();
    });
  }

  // 3. Periodic extension presence detection
  detectExtension();
  setInterval(detectExtension, 1000);
});

async function fetchRegistry() {
  try {
    const response = await fetch('./manifest.json?t=' + Date.now(), { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    registry = await response.json();
    
    // Read active theme from localStorage (for display on website)
    activeThemeId = localStorage.getItem('botc-hub-active-theme-id');
    
    renderThemes();
  } catch (err) {
    console.error('Failed to fetch manifest.json registry:', err);
    const grid = document.getElementById('catalog-grid');
    if (grid) {
      grid.innerHTML = `<div class="loading-state" style="color: var(--color-danger);">Error loading registry database: ${err.message}</div>`;
    }
  }
}

function renderThemes() {
  const container = document.getElementById('catalog-grid');
  if (!container || !registry || !registry.themes) return;

  const searchBar = document.getElementById('search-bar');
  const query = searchBar ? searchBar.value.toLowerCase().trim() : '';

  const filtered = registry.themes.filter(theme => {
    return theme.name.toLowerCase().includes(query) ||
           (theme.author && theme.author.toLowerCase().includes(query)) ||
           (theme.scriptName && theme.scriptName.toLowerCase().includes(query));
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="loading-state">No themes match your search query.</div>`;
    return;
  }

  container.innerHTML = '';

  const fullySupported = [];
  const justScripts = [];
  const justCSS = [];

  filtered.forEach(theme => {
    const hasScript = !!theme.scriptJsonUrl;
    const hasCSS = !!theme.cssUrl;

    if (hasScript && hasCSS) {
      fullySupported.push(theme);
    } else if (hasScript && !hasCSS) {
      justScripts.push(theme);
    } else if (!hasScript && hasCSS) {
      justCSS.push(theme);
    }
  });

  const categories = [
    { title: 'Fully Supported Scripts', items: fullySupported },
    { title: 'Just Scripts', items: justScripts },
    { title: 'Just CSS', items: justCSS }
  ];

  categories.forEach(cat => {
    if (query && cat.items.length === 0) {
      return; // Hide empty sections when searching
    }

    const section = document.createElement('div');
    section.className = 'category-section';

    const titleEl = document.createElement('h2');
    titleEl.className = 'category-title';
    titleEl.textContent = cat.title;
    section.appendChild(titleEl);

    const grid = document.createElement('div');
    grid.className = 'category-grid';

    if (cat.items.length === 0) {
      grid.innerHTML = `<div class="category-empty">No items registered in this category yet.</div>`;
    } else {
      cat.items.forEach(theme => {
        const isActive = theme.id === activeThemeId;
        const card = document.createElement('div');
        card.className = `theme-card ${isActive ? 'active' : ''}`;

        card.innerHTML = `
          <div class="theme-title-row">
            <h3 class="theme-name">${theme.name}</h3>
            ${isActive ? '<span class="active-badge">Selected</span>' : ''}
          </div>
          <div class="theme-author">Created by ${theme.author || 'Anonymous'}</div>
          ${theme.scriptName ? `<div class="theme-script"><strong>Target Script:</strong> ${theme.scriptName}</div>` : ''}
          <div class="theme-script-desc">
            ${theme.description || 'No description available.'}
          </div>
          <div class="card-actions">
            ${theme.cssUrl
              ? (isActive
                ? `<button class="web-btn web-btn-reset" data-action="reset">Reset CSS</button>`
                : `<button class="web-btn web-btn-primary" data-action="load">Load CSS</button>`
                )
              : ''
            }
            ${theme.scriptJsonUrl
              ? `<button class="web-btn web-btn-secondary" data-action="copy">Load JSON</button>`
              : ''
            }
          </div>
        `;

        // Bind actions
        const copyBtn = card.querySelector('[data-action="copy"]');
        if (copyBtn) {
          copyBtn.addEventListener('click', () => {
            copyScriptJson(theme);
          });
        }

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

        grid.appendChild(card);
      });
    }

    section.appendChild(grid);
    container.appendChild(section);
  });
}

function loadTheme(theme) {
  activeThemeId = theme.id;
  localStorage.setItem('botc-hub-active-theme-id', theme.id);

  // Dispatch custom DOM event for the extension/userscript content script to catch
  const event = new CustomEvent('botc-hub-load-theme', { detail: theme });
  document.dispatchEvent(event);

  renderThemes();

  // Check if extension is installed to give appropriate feedback
  const isInstalled = document.documentElement.dataset.botcHubInstalled === "true";
  if (isInstalled) {
    showToast(`CSS Theme "${theme.name}" loaded successfully! Open botc.app to see it.`);
  } else {
    showToast(`JSON copied! Install the Extension or Userscript to auto-load the CSS overlay.`);
    // Fallback: Copy script json to clipboard to help them anyway
    copyScriptJson(theme, true);
  }
}

function resetTheme() {
  activeThemeId = null;
  localStorage.removeItem('botc-hub-active-theme-id');

  // Dispatch custom event to reset in extension storage
  const event = new CustomEvent('botc-hub-reset-theme');
  document.dispatchEvent(event);

  renderThemes();
  showToast('Theme reset to default.');
}

async function copyScriptJson(theme, silent = false) {
  if (!theme.scriptJsonUrl) return;
  if (!silent) showToast('Fetching script JSON...');
  
  try {
    const response = await fetch(theme.scriptJsonUrl + '?t=' + Date.now(), { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    
    await navigator.clipboard.writeText(text);
    if (!silent) {
      showToast(`Script JSON for "${theme.name}" copied! Paste on botc.app to load.`);
    }
  } catch (err) {
    console.error('Failed to copy script JSON:', err);
    showToast(`Failed to load script: ${err.message}`);
  }
}

function detectExtension() {
  const isInstalled = document.documentElement.dataset.botcHubInstalled === "true";
  const badge = document.getElementById('extension-status');
  if (badge) {
    if (isInstalled) {
      badge.textContent = "Grimoire Pick Installed";
      badge.className = "status-badge detected";
    } else {
      badge.textContent = "Extension Not Detected";
      badge.className = "status-badge not-detected";
    }
  }
}

let toastTimeout = null;
function showToast(message) {
  const toast = document.getElementById('toast-notify');
  if (!toast) return;
  
  clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.classList.add('show');
  
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}
