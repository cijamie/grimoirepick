# BOTC Grimoire Hub 🩸🔮

**BOTC Grimoire Hub** is a visual customizer and script catalog helper designed for the official [Blood on the Clocktower Online App](https://botc.app). 

It allows hosts (Storytellers) and players to easily browse custom scripts, copy script JSON configurations to the clipboard, and dynamically inject custom visual CSS overlays directly into the game window. It features **Automatic Script Detection**—when you open or join a game room using a registered script, the hub automatically detects it and applies the corresponding visual theme.

The project is hosted as a GitHub Pages website and runs either as a **Chrome Extension** or a standalone **Tampermonkey Userscript**.

---

## Key Features

- 🎭 **Catalog Website**: A public dashboard (`index.html`) to browse scripts, copy their JSON, and load themes with one click.
- 🎨 **Visual Themes**: Load and apply custom CSS overlays that override the look and feel of `botc.app` (custom background art, scrollbars, fonts, and borders).
- 🔄 **Auto-Theme Detection**: Automatically detects the active custom script name in your current game room and applies the matching CSS stylesheet.
- 🎛️ **Floating Drawer Panel**: Toggle a sleek, dark-slate side drawer directly inside `botc.app` to search and switch themes on the fly.
- 🌐 **Dynamic GitHub Registry**: The registry is loaded dynamically from GitHub. Adding or updating a script in the repository immediately propagates changes to all extension users.

---

## Directory Structure

```text
├── Scripts/               # Custom BOTC script JSON files
│   └── zeroday.json
├── Themes/                # Custom CSS styling files for botc.app
│   └── zeroday.css
├── extension/             # Manifest V3 Chrome Extension source
│   ├── manifest.json      # Extension config
│   ├── background.js      # Proxy fetch worker (bypasses CSP/CORS)
│   ├── content.js         # Shadow-DOM piercing DOM scanner & UI injector
│   ├── popup.html/css/js  # Browser action popup dashboard
│   └── icon.png           # Extension icon
├── manifest.json          # Theme Registry (The database file fetched by the hub)
├── botc-hub.user.js       # Standalone Tampermonkey Userscript
├── index.html             # Dashboard website (deployable to GitHub Pages)
├── index.css              # Website stylesheet
├── index.js               # Website logic and extension event linker
└── README.md              # Documentation
```

---

## Installation & Setup

### 1. Browser Extension (Recommended)
1. Download or clone this repository to your computer.
2. In Google Chrome, go to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle in the top-right.
4. Click the **Load unpacked** button in the top-left.
5. Select the `extension/` folder in the project directory.
6. Open [botc.app](https://botc.app) and you will see the floating red/blue blood drop hub button in the bottom-right corner!

### 2. Standalone Userscript
1. Install a userscript manager browser extension like [Tampermonkey](https://www.tampermonkey.net/).
2. Click on the Tampermonkey icon and select **Create a new script...**
3. Copy the contents of the [botc-hub.user.js](botc-hub.user.js) file.
4. Paste it into the Tampermonkey editor and save (`Ctrl+S`).
5. Open [botc.app](https://botc.app) to launch.

---

## How to Add New Scripts and Themes

To expand the catalog with your own custom creations:

1. **Add the Script JSON**: Paste your custom script configuration file under `Scripts/myscript.json`. Ensure the script has an `_meta` field with a `name` parameter:
   ```json
   {
     "id": "_meta",
     "name": "My Custom Script Name"
   }
   ```
2. **Add the CSS Stylesheet**: Add your visual styles to `Themes/mytheme.css`. Target elements in the `botc.app` layout.
3. **Register in manifest.json**: Add a entry to the registry [manifest.json](manifest.json) at the root:
   ```json
   {
     "id": "mytheme",
     "name": "My Theme Name",
     "author": "Your Name",
     "scriptName": "My Custom Script Name",
     "scriptJsonUrl": "https://raw.githubusercontent.com/aerojamie/botc-custom-themes/main/Scripts/myscript.json",
     "cssUrl": "https://raw.githubusercontent.com/aerojamie/botc-custom-themes/main/Themes/mytheme.css"
   }
   ```
   *(Be sure to replace the GitHub repository URL with your own if you fork the project).*
4. **Commit & Push**: Push your changes to your main branch. The registry is dynamically fetched, so your changes will load instantly!

---

## Deploying as a GitHub Pages Website

To deploy the catalog dashboard website:
1. Go to your repository settings on GitHub.
2. Select the **Pages** tab on the left sidebar.
3. Under **Build and deployment**, set the source to **Deploy from a branch**.
4. Choose the `main` branch and root `/` directory, then click **Save**.
5. Once built, your catalog will be live at `https://<your-username>.github.io/<your-repo-name>/`.
