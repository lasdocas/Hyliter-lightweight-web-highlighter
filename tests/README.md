# Shadow DOM integration tests

The tests load the unpacked extension in a real Chromium browser, including its isolated content-script world and `chrome.dom.openOrClosedShadowRoot()` API. No DOM or extension API mocks are used.

Requires Node.js 20 or later:

```sh
npm ci
npx playwright install chromium
npm test
```

To use an existing Playwright Chromium executable, set `HYLITER_CHROMIUM_PATH` to its absolute path before running `npm test`. Use Chromium or Chrome for Testing: branded Chrome versions may disable the command-line flags required to load unpacked extensions.

Coverage includes ordinary document selections; open, closed, nested and dynamically attached roots; forward and backward cross-root selections; text and element offsets; automatic and manual slot assignment; background and `color-scheme` inheritance; group hover removal, undo and clear; detached hosts and moved highlights; overlapping marks; editable fields; and event deduplication. The legacy selection fallback is exercised by disabling `getComposedRanges()` in the extension's isolated world using CDP.

Top Layer tests create actual auto/manual popovers and modal dialogs inside closed roots, plus a popover host with its own closed root. They verify hit testing and real mouse clicks for color and removal controls, preserving the host popup, Escape handling, owner-close cleanup, and viewport positioning under transformed/clipped ancestors. CDP also captures exceptions from the extension's isolated execution world.

Floating controls use manual popovers mounted inside their containing popup so native light dismissal and modal inertness work correctly. When mounted inside a ShadowRoot, they adopt a shared stylesheet loaded from the extension's `content.css` resource; the manifest exposes only that stylesheet using a dynamic resource URL.

Cross-root selection uses `Selection.getComposedRanges({ shadowRoots })` and splits its static endpoints into local text ranges in composed-tree order. Older engines fall back to each root's selection API and skip cross-root selections they cannot resolve safely. Closed roots depend on the Chromium extension API; this behavior is not available to a script running only in the page's JavaScript world.

The npm dependencies are for development and testing only. Loading the extension itself requires no npm installation or build step.
