const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const fixture = `<!doctype html><html><head><style>
body { margin: 60px; font: 20px sans-serif; }
.host { display: block; padding: 10px; margin: 10px; }
</style></head><body><p id="before">Before plain text</p><main></main>
<p id="after">After plain text</p><script>
window.refs = { before: document.querySelector('#before'), after: document.querySelector('#after') };
window.roots = {};
window.makeRoot = (name, mode = 'open', parent = document.querySelector('main')) => {
  const host = document.createElement('div');
  host.className = 'host';
  parent.append(host);
  const root = host.attachShadow({ mode });
  root.innerHTML = '<p>Alpha <b>bravo</b> charlie delta</p>';
  refs[name] = root.querySelector('p');
  roots[name] = root;
  return root;
};
makeRoot('open');
makeRoot('closed', 'closed');
makeRoot('nested', 'closed', makeRoot('outer'));
const slotRoot = makeRoot('slot');
slotRoot.innerHTML = '<p id="prefix">Prefix</p><slot></slot><p id="suffix">Suffix</p>';
const slotted = document.createElement('span');
slotted.textContent = 'Slotted words';
slotRoot.host.append(slotted);
refs.slotted = slotted;
refs.prefix = slotRoot.querySelector('#prefix');
refs.suffix = slotRoot.querySelector('#suffix');
roots.closed.host.style.backgroundColor = 'rgb(20, 20, 20)';
</script></body></html>`;

let server, context, profile, baseURL;
before(async () => {
  server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fixture);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${server.address().port}`;
  profile = await fs.mkdtemp(path.join(os.tmpdir(), 'hyliter-test-'));
  const extension = path.resolve(__dirname, '..');
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    ...(process.env.HYLITER_CHROMIUM_PATH ? { executablePath: process.env.HYLITER_CHROMIUM_PATH } : {}),
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  if (!context.serviceWorkers().length) await context.waitForEvent('serviceworker');
  console.info(`Chromium ${context.browser().version()} (unpacked extension)`);
});
after(async () => {
  await context?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  if (profile) await fs.rm(profile, { recursive: true, force: true });
});

async function withPage(fn) {
  const page = await context.newPage();
  const errors = [];
  const runtime = await context.newCDPSession(page);
  runtime.on('Runtime.exceptionThrown', ({ exceptionDetails }) =>
    errors.push(exceptionDetails.exception?.description || exceptionDetails.text));
  await runtime.send('Runtime.enable');
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    await page.goto(baseURL);
    await page.waitForFunction(() => {
      const probe = document.createElement('div');
      probe.className = 'twh-panel';
      document.body.append(probe);
      const ready = getComputedStyle(probe).position === 'fixed';
      probe.remove();
      return ready;
    });
    await fn(page);
    assert.deepEqual(errors, []);
  } catch (error) {
    if (errors.length) console.error('Browser errors:', errors.join('\n'));
    throw error;
  } finally {
    await runtime.detach();
    await page.close();
  }
}

async function select(page, from, start, to = from, end = null, backwards = false) {
  await page.evaluate(({ from, start, to, end, backwards }) => {
    const firstText = (el) => el.nodeType === Node.TEXT_NODE ? el :
      document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
    const lastText = (el) => {
      if (el.nodeType === Node.TEXT_NODE) return el;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let last, node;
      while ((node = walker.nextNode())) last = node;
      return last;
    };
    const a = firstText(refs[from]);
    const b = lastText(refs[to]);
    const selection = getSelection();
    selection.removeAllRanges();
    const finish = end ?? b.length;
    if (backwards) selection.setBaseAndExtent(b, finish, a, start);
    else selection.setBaseAndExtent(a, start, b, finish);
    a.parentElement.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, composed: true, button: 0, detail: 1 }));
  }, { from, start, to, end, backwards });
  await page.waitForFunction(() => [document, ...Object.values(roots)]
    .some((root) => root.querySelector('.twh-panel')), undefined, { timeout: 3000 });
}

async function mark(page, from, start = 0, to = from, end = null, backwards = false) {
  await select(page, from, start, to, end, backwards);
  await page.keyboard.press('1');
}

async function marks(page) {
  return page.evaluate(() => Object.fromEntries(
    Object.entries({ document, ...roots }).map(([name, root]) => [name,
      [...root.querySelectorAll('.twh-highlight-mark')].map((el) => ({
        text: el.textContent, group: el.dataset.twhGroup, mode: el.dataset.twhMode,
        bg: getComputedStyle(el).backgroundColor, radius: getComputedStyle(el).borderRadius,
      })),
    ]),
  ));
}

test('plain document selection keeps exact offsets and undo', () => withPage(async (page) => {
  await mark(page, 'before', 2, 'before', 10);
  assert.deepEqual((await marks(page)).document.map((m) => m.text), ['fore pla']);
  await page.keyboard.press('Control+z');
  assert.equal((await marks(page)).document.length, 0);
}));

test('open, closed and nested roots: exact text, inherited theme, inline styles, undo', () => withPage(async (page) => {
  for (const name of ['open', 'closed', 'nested']) {
    await mark(page, name, 2, name, 8);
    const result = (await marks(page))[name];
    assert.deepEqual(result.map((m) => m.text), ['pha ', 'bravo', ' charlie']);
    assert.equal(new Set(result.map((m) => m.group)).size, 1);
    assert.ok(result.every((m) => m.radius === '2px'));
    assert.ok(result.every((m) => m.mode === (name === 'closed' ? 'dark' : 'light')));
    await page.keyboard.press('Control+z');
    assert.equal((await marks(page))[name].length, 0);
  }
}));

test('composedPath finds closed-root highlights and hover removal removes the whole group', () => withPage(async (page) => {
  await mark(page, 'closed');
  await page.evaluate(() => roots.closed.querySelector('.twh-highlight-mark')
    .dispatchEvent(new MouseEvent('mouseover', { bubbles: true, composed: true })));
  await page.waitForSelector('.twh-unmark-btn');
  await page.locator('.twh-unmark-btn').click();
  assert.equal((await marks(page)).closed.length, 0);
}));

test('cross-root selection shares one group, uses local themes and undoes once', () => withPage(async (page) => {
  await mark(page, 'open', 2, 'closed', 8);
  const result = await marks(page);
  assert.equal(result.open.map((m) => m.text).join(''), 'pha bravo charlie delta');
  assert.equal(result.closed.map((m) => m.text).join(''), 'Alpha bravo charlie');
  assert.equal(new Set([...result.open, ...result.closed].map((m) => m.group)).size, 1);
  assert.ok(result.open.every((m) => m.mode === 'light'));
  assert.ok(result.closed.every((m) => m.mode === 'dark'));
  await page.keyboard.press('Control+z');
  assert.equal(Object.values(await marks(page)).flat().length, 0);
}));

test('backward selection crosses document and nested shadow trees', () => withPage(async (page) => {
  await mark(page, 'before', 7, 'nested', 8, true);
  const result = await marks(page);
  assert.equal(result.document.map((m) => m.text).join(''), 'plain text');
  assert.equal(result.nested.map((m) => m.text).join(''), 'Alpha bravo charlie');
  assert.ok(result.open.length && result.closed.length && result.outer.length);
  await page.keyboard.press('Control+z');
  assert.equal(Object.values(await marks(page)).flat().length, 0);
}));

test('slot content follows composed order and is highlighted only once', () => withPage(async (page) => {
  await mark(page, 'prefix', 2, 'suffix', 3);
  const result = await marks(page);
  assert.equal(result.slot.map((m) => m.text).join(''), 'efixSuf');
  assert.equal(result.document.map((m) => m.text).join(''), 'Slotted words');
  assert.equal(new Set([...result.slot, ...result.document].map((m) => m.group)).size, 1);
  await page.keyboard.press('Control+z');
  assert.equal(Object.values(await marks(page)).flat().length, 0);
}));

test('clear all covers document, nested roots, closed roots and detached hosts', () => withPage(async (page) => {
  for (const name of ['before', 'open', 'closed', 'nested']) await mark(page, name);
  await page.evaluate(() => roots.closed.host.remove());
  await select(page, 'after', 0);
  const clear = page.locator('[data-action="clear"]');
  await clear.click({ force: true });
  await clear.click({ force: true });
  assert.equal(Object.values(await marks(page)).flat().length, 0);
}));

test('dynamic attachShadow after initialization is discovered', () => withPage(async (page) => {
  await page.evaluate(() => makeRoot('dynamic', 'closed'));
  await mark(page, 'dynamic', 1, 'dynamic', 4);
  assert.equal((await marks(page)).dynamic.map((m) => m.text).join(''), 'lpha bravo cha');
  await page.keyboard.press('Control+z');
  assert.equal((await marks(page)).dynamic.length, 0);
}));

test('closed-root text fields retain their own undo and number keys', () => withPage(async (page) => {
  await mark(page, 'open');
  await page.evaluate(() => {
    const input = document.createElement('input');
    roots.closed.append(input);
    input.focus();
  });
  await page.keyboard.press('Control+z');
  assert.ok((await marks(page)).open.length);
  await page.keyboard.press('1');
  assert.equal(await page.evaluate(() => roots.closed.querySelector('input').value), '1');
  await page.evaluate(() => roots.closed.querySelector('input').blur());
  await page.keyboard.press('Control+z');
  assert.equal((await marks(page)).open.length, 0);
}));

test('nested overlapping highlights can be undone and cleared independently', () => withPage(async (page) => {
  await mark(page, 'open');
  await mark(page, 'open', 1, 'open', 5);
  await page.keyboard.press('Control+z');
  assert.equal((await marks(page)).open.map((m) => m.text).join(''), 'Alpha bravo charlie delta');
  await page.keyboard.press('Control+z');
  assert.equal((await marks(page)).open.length, 0);
  assert.equal(await page.evaluate(() => refs.open.textContent), 'Alpha bravo charlie delta');
}));

test('closed slots continue background detection through the assigned slot', () => withPage(async (page) => {
  await page.evaluate(() => {
    const root = makeRoot('closedSlot', 'closed');
    root.innerHTML = '<slot style="background: rgb(10, 10, 10)"></slot>';
    const el = document.createElement('span');
    el.textContent = 'Slotted dark text';
    root.host.append(el);
    refs.darkSlotText = el;
  });
  await mark(page, 'darkSlotText');
  assert.equal((await marks(page)).document[0].mode, 'dark');
  await page.keyboard.press('Control+z');
  assert.equal((await marks(page)).document.length, 0);
}));

test('manual closed slots keep text assigned while highlighting and undoing', () => withPage(async (page) => {
  await page.evaluate(() => {
    const host = document.createElement('div');
    document.querySelector('main').append(host);
    const root = host.attachShadow({ mode: 'closed', slotAssignment: 'manual' });
    root.innerHTML = '<slot></slot>';
    const text = document.createTextNode('Manual text content');
    host.append(text, document.createTextNode('UNASSIGNED'));
    root.querySelector('slot').assign(text);
    roots.manual = root;
    refs.manual = text;
  });
  await mark(page, 'manual', 2, 'manual', 8);
  assert.equal((await marks(page)).document[0].text, 'nual t');
  const assignedText = () => page.evaluate(() => roots.manual.querySelector('slot').assignedNodes()
    .map((node) => node.textContent).join(''));
  assert.equal(await assignedText(), 'Manual text content');
  await page.keyboard.press('Control+z');
  assert.equal((await marks(page)).document.length, 0);
  assert.equal(await assignedText(), 'Manual text content');
  await mark(page, 'manual', 0, 'manual', 1);
  await page.evaluate(() => roots.manual.host.remove());
  await page.keyboard.press('Control+z');
  assert.equal(await assignedText(), 'Manual text content');
  assert.equal(await page.evaluate(() => roots.manual.host.querySelectorAll('.twh-highlight-mark').length), 0);
}));

test('one shortcut inside a nested closed root removes exactly one history entry', () => withPage(async (page) => {
  await mark(page, 'open');
  await mark(page, 'nested');
  await page.evaluate(() => {
    refs.nested.tabIndex = 0;
    refs.nested.focus();
  });
  await page.keyboard.press('Control+z');
  const result = await marks(page);
  assert.equal(result.nested.length, 0);
  assert.ok(result.open.length);
  await page.keyboard.press('Control+z');
  assert.equal((await marks(page)).open.length, 0);
}));

test('moving a highlight to a different root does not break group undo', () => withPage(async (page) => {
  await mark(page, 'closed');
  await page.evaluate(() => roots.open.append(roots.closed.querySelector('.twh-highlight-mark')));
  await page.keyboard.press('Control+z');
  const result = await marks(page);
  assert.equal(result.open.length, 0);
  assert.equal(result.closed.length, 0);
}));

test('element-offset endpoints split accurately across roots', () => withPage(async (page) => {
  await page.evaluate(() => {
    getSelection().setBaseAndExtent(refs.open, 1, refs.closed, 2);
    refs.open.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, composed: true, detail: 1 }));
  });
  await page.waitForSelector('.twh-panel', { state: 'attached' });
  await page.keyboard.press('1');
  const result = await marks(page);
  assert.equal(result.open.map((m) => m.text).join(''), 'bravo charlie delta');
  assert.equal(result.closed.map((m) => m.text).join(''), 'Alpha bravo');
}));

test('transparent shadow content respects a dark host color-scheme', () => withPage(async (page) => {
  await page.evaluate(() => { roots.open.host.style.colorScheme = 'dark'; });
  await mark(page, 'open');
  assert.ok((await marks(page)).open.every((m) => m.mode === 'dark'));
}));

test('older-browser fallback handles individual roots and refuses ambiguous cross-root selections', () => withPage(async (page) => {
  const session = await context.newCDPSession(page);
  const worlds = [];
  session.on('Runtime.executionContextCreated', ({ context }) => worlds.push(context));
  await session.send('Runtime.enable');
  const world = worlds.find((world) => world.origin.startsWith('chrome-extension://'));
  assert.ok(world, JSON.stringify(worlds));
  await session.send('Runtime.evaluate', {
    contextId: world.id,
    expression: 'Selection.prototype.getComposedRanges = undefined',
  });
  for (const name of ['before', 'open', 'closed', 'nested']) {
    await mark(page, name);
    assert.ok(Object.values(await marks(page)).flat().length);
    await page.keyboard.press('Control+z');
    assert.equal(Object.values(await marks(page)).flat().length, 0);
  }
  for (const [from, to] of [['open', 'closed'], ['before', 'nested'], ['closed', 'after']]) {
    await page.evaluate(({ from, to }) => {
      getSelection().setBaseAndExtent(refs[from].firstChild, 1, refs[to].lastChild, 4);
      refs[from].dispatchEvent(new MouseEvent('mouseup', { bubbles: true, composed: true, detail: 1 }));
    }, { from, to });
    // 同一任务队列中 mouseup 安排的回调先执行，避免依赖固定等待时间。
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
    assert.equal(await page.locator('.twh-panel').count(), 0, `${from} -> ${to}`);
    assert.equal(Object.values(await marks(page)).flat().length, 0);
  }
  await session.detach();
}));

async function openTopLayerPopup(page, kind = 'auto') {
  await page.evaluate((kind) => {
    const root = makeRoot('popup', 'closed');
    const style = 'position:fixed;inset:60px;margin:0;width:auto;height:auto;padding:40px;' +
      'background:white;color:black;font:20px sans-serif;overflow:auto';
    let popup;
    if (kind === 'host') {
      popup = root.host;
      popup.setAttribute('popover', 'auto');
      root.innerHTML = '<p>Popover text to highlight</p>';
    } else {
      root.innerHTML = kind === 'dialog'
        ? '<dialog><p>Popover text to highlight</p></dialog>'
        : '<section popover="' + kind + '"><p>Popover text to highlight</p></section>';
      popup = root.firstChild;
    }
    popup.style.cssText = style;
    refs.popup = root.querySelector('p');
    refs.popupOverlay = popup;
    if (kind === 'dialog') popup.showModal();
    else popup.showPopover();
  }, kind);
}

async function clickPopupControl(page, selector) {
  const point = await page.evaluate((selector) => {
    const el = roots.popup.querySelector(selector);
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = roots.popup.elementFromPoint(x, y);
    return { x, y, hit: hit === el || el.contains(hit) };
  }, selector);
  assert.ok(point.hit, `${selector} must receive pointer hits above the host popup`);
  await page.mouse.click(point.x, point.y);
}

for (const kind of ['auto', 'manual', 'host', 'dialog']) {
  test(`panel is above a closed-root ${kind} popup and clicks preserve the host popup`, () => withPage(async (page) => {
    await openTopLayerPopup(page, kind);
    await select(page, 'popup', 0);
    const state = await page.evaluate(() => {
      const panel = roots.popup.querySelector('.twh-panel');
      const css = getComputedStyle(panel);
      return {
        open: panel.matches(':popover-open'), type: panel.getAttribute('popover'),
        margin: css.margin, overflow: css.overflow,
      };
    });
    assert.deepEqual(state, { open: true, type: 'manual', margin: '0px', overflow: 'visible' });
    await clickPopupControl(page, '.twh-swatch');
    assert.equal((await marks(page)).popup.map((mark) => mark.text).join(''), 'Popover text to highlight');
    assert.equal(await page.evaluate(() => refs.popupOverlay.matches(':popover-open, :modal')), true);
    assert.equal(await page.evaluate(() => roots.popup.querySelector('.twh-panel')), null);
  }));
}

test('hover removal is above the closed-root auto popover and remains clickable', () => withPage(async (page) => {
  await openTopLayerPopup(page);
  await mark(page, 'popup');
  const point = await page.evaluate(() => {
    const rect = roots.popup.querySelector('.twh-highlight-mark').getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await page.mouse.move(point.x, point.y);
  await page.waitForFunction(() => roots.popup.querySelector('.twh-unmark-btn')?.matches(':popover-open'));
  await clickPopupControl(page, '.twh-unmark-btn');
  assert.equal((await marks(page)).popup.length, 0);
  assert.equal(await page.evaluate(() => refs.popupOverlay.matches(':popover-open')), true);
}));

test('Escape dismisses the extension panel first and leaves the auto popover open', () => withPage(async (page) => {
  await openTopLayerPopup(page);
  await select(page, 'popup', 0);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => roots.popup.querySelector('.twh-panel')), null);
  assert.equal(await page.evaluate(() => refs.popupOverlay.matches(':popover-open')), true);
}));

test('closing the owner popover removes the extension panel and hover button from Top Layer', () => withPage(async (page) => {
  await openTopLayerPopup(page);
  await select(page, 'popup', 0);
  await page.evaluate(() => refs.popupOverlay.hidePopover());
  assert.equal(await page.evaluate(() => roots.popup.querySelector('.twh-panel')), null);
  await page.evaluate(() => refs.popupOverlay.showPopover());
  await mark(page, 'popup');
  await page.evaluate(() => roots.popup.querySelector('.twh-highlight-mark')
    .dispatchEvent(new MouseEvent('mouseover', { bubbles: true, composed: true })));
  await page.waitForFunction(() => roots.popup.querySelector('.twh-unmark-btn')?.matches(':popover-open'));
  await page.evaluate(() => refs.popupOverlay.hidePopover());
  assert.equal(await page.evaluate(() => roots.popup.querySelector('.twh-unmark-btn')), null);
}));

test('Top Layer panel retains viewport positioning under a transformed and clipped page', () => withPage(async (page) => {
  await page.evaluate(() => {
    document.body.style.cssText = 'transform:translate(30px,20px);overflow:hidden;width:100px;height:100px';
  });
  await openTopLayerPopup(page);
  await select(page, 'popup', 0);
  const position = await page.evaluate(() => {
    const panel = roots.popup.querySelector('.twh-panel');
    const rect = panel.getBoundingClientRect();
    return { left: rect.left, top: rect.top, cssLeft: parseFloat(panel.style.left), cssTop: parseFloat(panel.style.top) };
  });
  assert.ok(Math.abs(position.left - position.cssLeft) < 0.1); // 布局坐标按子像素取整。
  assert.ok(Math.abs(position.top - position.cssTop) <= 4); // 面板淡入时的 translateY 最大为 4px。
  await clickPopupControl(page, '.twh-swatch');
  assert.ok((await marks(page)).popup.length);
}));
