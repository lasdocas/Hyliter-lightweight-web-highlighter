# Privacy Policy for Hyliter - Lightweight Web Highlighter

**Last updated: July 17, 2026**

Your privacy is paramount to us. **Hyliter - Lightweight Web Highlighter** ("the Extension") is designed to be a lightweight, secure, and privacy-first web highlighting tool. This Privacy Policy outlines our strict commitment to data privacy.

### 1. No Data Collection and No Transmission
We believe that your data belongs entirely to you. 
* **Zero Data Collection:** Hyliter does not collect, log, track, or monitor any personal information, browsing history, keystrokes, or selected text.
* **No External Communication:** The Extension runs entirely locally within your browser. It does not communicate with any external servers, third-party databases, or API services. 

### 2. Local Processing and Temporary Storage
Hyliter processes all highlights directly inside your browser window.
* **No Persistence of Highlights:** All highlighters and annotations exist only temporarily in the active page's Document Object Model (DOM). Once you reload, close, or navigate away from the page, the highlights are cleared and not saved anywhere on your computer or on our end.
* **Configuration Toggle:** The Extension uses Chrome's native storage API (`chrome.storage.local`) solely to remember your single preference: whether Hyliter is currently globally enabled or paused. No personal identifiers or usage statistics are stored within this toggle.

### 3. Permissions Justification
To perform its function, Hyliter requests minimal permissions:
* **`storage`**: Necessary to remember if the user has toggled the extension "on" or "off" across browser sessions.
* **Active Webpages Access (`<all_urls>`)**: Necessary to inject the highlighter script (`content.js`) and styling (`content.css`) so you can select and highlight text on any website you visit. 

### 4. Third-Party Services
Hyliter does not use, integrate, or share data with any third-party analytics, tracking libraries, or advertising platforms.

### 5. Changes to This Policy
We may update this Privacy Policy from time to time. Any changes will be published on this page.

### 6. Contact Us
If you have any questions about this Privacy Policy or Hyliter, please reach out to us by opening an issue on our official GitHub repository.
