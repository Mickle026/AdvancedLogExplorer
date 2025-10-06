# AdvancedLogExplorer (Emby Plugin)

AdvancedLogExplorer is an **Emby Server plugin** that provides an interactive log viewer inside the Emby admin dashboard.  
It makes it easy to browse, search, and export logs without leaving the web interface.

---

## Features

- 📂 **Log file selection** — choose any Emby server log (`embyserver.txt`, `ffmpeg.txt`, rotated logs, etc.).
- 🔍 **Keyword filtering** — filter log entries using one or two keywords with logical operators (`AND`, `OR`, `NOT`).
- ⚡ **Presets** — quickly filter logs by categories like:
  - Exceptions  
  - Playback  
  - Transcode  
  - Network  
  - Library  
  - Metadata  
  - Plugin-specific (`plugin:Name`)
- 🧩 **Plugin filter dropdown** — lists plugins found in the selected log file (`Info App: Loading …` lines).  
  *(Note: this dropdown will be empty if no plugins are listed in that log.)*
- 📑 **Split view** — view both the filtered log and the raw log side by side.
- 📋 **Copy / Download** — copy filtered or raw logs to the clipboard, or download them as `.txt` files.

---

## Installation

1. Build the plugin from source (Visual Studio → build in **Release**).
2. Copy the generated `.dll` into your Emby Server `programdata/plugins/` directory.
   - Default location on Windows:  
     ```
     C:\Users\<YourUser>\AppData\Roaming\Emby-Server\programdata\plugins\
     ```
3. Restart Emby Server.
4. Go to **Dashboard → Plugins → AdvancedLogExplorer**.

---

## Usage

1. Open the **AdvancedLogExplorer** plugin page in the Emby admin dashboard.
2. Use the **first dropdown** to select which log file to view.
3. (Optional) If the log contains plugin load entries, the **second dropdown** will list those plugin names. Select one to filter by that plugin.
4. Apply **keywords** or choose a **preset** to further refine the log view.
5. Toggle **split view** to see the raw log alongside the filtered log.
6. Use the buttons at the bottom to:
   - **Copy Filtered** — copies the filtered log to clipboard.
   - **Copy Raw** — copies the raw log to clipboard.
   - **Download Filtered** — saves the filtered log as a text file.
   - **Download Raw** — saves the raw log as a text file.

---

## Notes

- The plugin filter dropdown only shows entries if the log includes lines like:  
Info App: Loading PosterRotator, Version=1.0.0.0 ...

If no such entries exist in the selected log file, the dropdown will be empty.
- Blank lines are stripped for clarity in both filtered and raw views.
- This plugin requires **Emby Server 4.8.11.0** or later.

---

## 🧑‍💻 Developers
**Author:** Mike Williams  
---

## License

MIT License.  
