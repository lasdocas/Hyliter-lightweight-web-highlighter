(() => {
  'use strict';

  // 浅色模式配色（网页为浅色模式时使用）—— 7 个色相区分度较高的颜色，
  // 同时与键盘快捷键 1~7 一一对应
  const LIGHT_COLORS = ['#FFD9E3', '#FFE0C7', '#FFF2B8', '#E3F2C1', '#C8F0DE', '#CDE8F5', '#E5D9F2'];
  // 深色模式配色（网页为深色模式时使用），顺序与上面一一对应，同一下标即同一色相的深浅两版
  const DARK_COLORS  = ['#7A3C52', '#7A5638', '#6E5A20', '#556429', '#276B4E', '#2A5C74', '#5B4478'];

  const HL_CLASS = 'twh-highlight-mark';
  const GAP = 8; // 面板与选区之间的间距，避免遮挡文本

  // 面板操作按钮图标：改用 currentColor 描边的 SVG，不再用 📋/🗑️ 表情符号，
  // 这样图标颜色能随浅色/深色主题切换，复制成功时也能直接把颜色变绿而不需要换图标
  const COPY_ICON_SVG =
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="8" y="8" width="12" height="12" rx="2"></rect>' +
    '<path d="M4 16V4a2 2 0 0 1 2-2h10"></path></svg>';
  const CLEAR_ICON_SVG =
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M3 6h18"></path>' +
    '<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>' +
    '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>' +
    '<line x1="10" y1="11" x2="10" y2="17"></line>' +
    '<line x1="14" y1="11" x2="14" y2="17"></line></svg>';

  let mode = 'light';     // 当前配色模式：每次弹出面板时，根据选区所在位置的背景色自动判断浅/深，不再支持手动切换
  let panelEl = null;
  let savedRange = null;  // 弹出面板那一刻的选区，供后续按钮点击时使用

  let enabled = true; // 插件开启/暂停状态，来自工具栏图标点击，跨标签页同步
  const ENABLED_KEY = 'hyliterEnabled';

  chrome.storage.local.get({ [ENABLED_KEY]: true }, (res) => {
    enabled = res[ENABLED_KEY];
    if (!enabled) {
      hidePanel();
      hideUnmarkButton();
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[ENABLED_KEY]) return;
    enabled = changes[ENABLED_KEY].newValue;
    if (!enabled) {
      // 插件被暂停：立刻收起当前正在展示的面板/取消按钮，
      // 但已存在的高亮标记保留在页面上，不做改动
      hidePanel();
      hideUnmarkButton();
    }
  });

  let clearConfirmTimer = null; // “清除”按钮二次确认的等待计时器
  const CLEAR_CONFIRM_TIMEOUT = 2500; // 首次点击后，等待第二次点击的时间窗口（毫秒）

  let hoveredMark = null; // 当前显示取消按钮所对应的高亮 span
  let unmarkBtn = null;   // 悬浮取消按钮
  let unmarkHideTimer = null;
  let switchCandidateMark = null;  // 鼠标当前停留的“另一条”高亮，尚未确认是否真的要切换过去
  let switchCandidateTimer = null; // 确认切换前的缓冲，避免路过时误切换
  let lastMouseX = -1;
  let lastMouseY = -1;

  // “安全区域”相关参数：见下方 currentSafeZone() 说明
  const UNMARK_ZONE_MARGIN = 10;   // 安全区域向外扩展的缓冲（px），吞掉按钮与高亮之间的空隙
  const UNMARK_HIDE_DELAY = 250;   // 鼠标真正离开安全区域后，延迟这么久再隐藏（毫秒），留出反应时间
  const UNMARK_SWITCH_DELAY = 220; // 鼠标停留在另一条高亮上多久，才确认要把按钮切换过去

  /* ============ 自动判断浅色 / 深色模式 ============ */

  // 解析 getComputedStyle 返回的 rgb()/rgba() 字符串
  function parseRgb(str) {
    const m = str && str.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\)/);
    if (!m) return null;
    return {
      r: parseFloat(m[1]),
      g: parseFloat(m[2]),
      b: parseFloat(m[3]),
      a: m[4] !== undefined ? parseFloat(m[4]) : 1,
    };
  }

  // YIQ 感知亮度公式，返回 0（最暗）~255（最亮）
  function brightnessOf(rgb) {
    return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  }

  // 从选区所在节点开始向上找第一个不透明的背景色；
  // 这样即便页面整体是浅色但选区正好落在深色卡片/代码块里，也能就近判断，而不是只看整站背景
  function findBackgroundColor(node) {
    let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    while (el && el.nodeType === Node.ELEMENT_NODE) {
      const rgb = parseRgb(getComputedStyle(el).backgroundColor);
      if (rgb && rgb.a > 0) return rgb;
      el = el.parentElement;
    }
    // 一路向上都是透明背景时，退回浏览器默认画布颜色（白色）
    return { r: 255, g: 255, b: 255, a: 1 };
  }

  function detectModeForRange(range) {
    const rgb = findBackgroundColor(range.commonAncestorContainer);
    return brightnessOf(rgb) < 128 ? 'dark' : 'light';
  }

  /* ============ 面板显示 / 隐藏 ============ */

  function showPanelForSelection() {
    if (!enabled) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const text = sel.toString();
    if (!text || !text.trim()) return;

    savedRange = sel.getRangeAt(0).cloneRange();
    mode = detectModeForRange(savedRange);
    ensurePanel();
    renderPanel();
    positionPanel(savedRange);
    requestAnimationFrame(() => panelEl && panelEl.classList.add('twh-visible'));
  }

  function hidePanel() {
    clearTimeout(clearConfirmTimer);
    if (panelEl) {
      panelEl.remove();
      panelEl = null;
    }
  }

  function ensurePanel() {
    if (panelEl) panelEl.remove();
    panelEl = document.createElement('div');
    panelEl.className = 'twh-panel';
    document.body.appendChild(panelEl);
    // 阻止在面板内点击时清空页面选区 / 触发“点击外部关闭”逻辑
    panelEl.addEventListener('mousedown', (e) => e.preventDefault());
  }

  function renderPanel() {
    panelEl.classList.toggle('twh-theme-light', mode === 'light');
    panelEl.classList.toggle('twh-theme-dark', mode === 'dark');

    // 色块不再只展示"当前模式"下的单一颜色，而是浅/深两版对角分割同时展示，
    // 这样无论面板处于哪个模式，用户都能一眼看到这个色相在浅色页面和深色页面下分别长什么样。
    // 实际点击时仍按当前 mode 生效——mode 只决定"套用哪一半"，不影响色块的展示方式。
    panelEl.innerHTML = `
      <div class="twh-arrow"></div>
      <div class="twh-row twh-row-swatches">
        ${LIGHT_COLORS.map((lc, i) => {
          const dc = DARK_COLORS[i];
          return `<button class="twh-swatch" data-action="mark" data-color-light="${lc}" data-color-dark="${dc}" style="background: linear-gradient(135deg, ${lc} 50%, ${dc} 50%); background-clip: padding-box; -webkit-background-clip: padding-box;"></button>`;
        }).join('')}
        <div class="twh-actions-group">
          <button class="twh-btn" data-action="copy">${COPY_ICON_SVG}</button>
          <button class="twh-btn" data-action="clear" data-confirm="0">${CLEAR_ICON_SVG}</button>
        </div>
      </div>
    `;

    panelEl.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', onPanelButtonClick);
    });
  }

  function onPanelButtonClick(e) {
    const action = e.currentTarget.dataset.action;

    if (action === 'copy') {
      copySelection();
    } else if (action === 'clear') {
      handleClearClick(e.currentTarget);
    } else if (action === 'mark') {
      const ds = e.currentTarget.dataset;
      // 背景用当前模式对应的那一版颜色，文字色用同一色相的另一版——
      // 二者本就是深浅配对，浅底配深字/深底配浅字，对比度天然有保障，
      // 不必再退回黑/白这种和色块本身脱节的通用色
      const bg = mode === 'light' ? ds.colorLight : ds.colorDark;
      const fg = mode === 'light' ? ds.colorDark : ds.colorLight;
      if (savedRange) highlightRange(savedRange, bg, fg, mode);
      hidePanel();
      window.getSelection().removeAllRanges();
    }
  }

  // 呼吸灯/弹跳反馈改用 Web Animations API（element.animate()）直接在 JS 里驱动，
  // 不再依赖 CSS 的 animation 属性 + @keyframes。
  // 原因：部分宿主页面（如 claude.ai）自身的样式表用了 CSS Cascade Layers（@layer），
  // 而我们注入的 content.css 是"未分层"样式——按规范，!important 声明在层叠层里的
  // 优先级顺序是反过来的：写在某个具名 @layer 里的 !important 一定赢未分层的 !important，
  // 跟选择器优先级、写在谁后面完全无关。所以无论怎么加 !important 或提高 .twh-btn-confirm
  // 的选择器优先级都无法保证赢，只有换成不经过 CSS animation 解析路径的 WAAPI 才能彻底避开这个坑。
  function pulseConfirm(btn) {
    if (btn._twhPulseAnim) btn._twhPulseAnim.cancel();
    btn._twhPulseAnim = btn.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }],
      { duration: 1000, iterations: Infinity, easing: 'ease-in-out' }
    );
  }

  function stopPulseConfirm(btn) {
    if (btn._twhPulseAnim) {
      btn._twhPulseAnim.cancel();
      btn._twhPulseAnim = null;
    }
  }

  function handleClearClick(btn) {
    if (btn.dataset.confirm === '1') {
      clearTimeout(clearConfirmTimer);
      stopPulseConfirm(btn);
      clearAllHighlights();
      hidePanel();
      return;
    }

    btn.dataset.confirm = '1';
    btn.classList.add('twh-btn-confirm');
    pulseConfirm(btn);
    clearTimeout(clearConfirmTimer);
    clearConfirmTimer = setTimeout(() => resetClearButton(btn), CLEAR_CONFIRM_TIMEOUT);
  }

  function resetClearButton(btn) {
    if (!btn || !btn.isConnected) return;
    btn.dataset.confirm = '0';
    btn.classList.remove('twh-btn-confirm');
    stopPulseConfirm(btn);
  }

  /* ============ 定位：不遮挡正在高亮的文本 ============ */

  function positionPanel(range) {
    const rect = range.getBoundingClientRect();

    panelEl.style.visibility = 'hidden';
    panelEl.style.left = '0px';
    panelEl.style.top = '0px';
    const pw = panelEl.offsetWidth;
    const ph = panelEl.offsetHeight;

    // 优先放在选区下方；空间不够则放到选区上方
    let placement = 'below';
    let top = rect.bottom + GAP;
    if (top + ph > window.innerHeight) {
      top = rect.top - ph - GAP;
      placement = 'above';
    }
    if (top < 0) top = GAP;

    let left = rect.left + rect.width / 2 - pw / 2;
    left = Math.max(GAP, Math.min(left, window.innerWidth - pw - GAP));

    panelEl.style.left = `${left}px`;
    panelEl.style.top = `${top}px`;
    panelEl.style.visibility = 'visible';

    positionArrow(rect, left, placement, pw);
  }

  function positionArrow(selectionRect, panelLeft, placement, panelWidth) {
    const arrow = panelEl.querySelector('.twh-arrow');
    if (!arrow) return;

    const HALF = 6;   // 三角形宽度的一半（左右各 6px 边框画出三角形）
    const MARGIN = 14; // 箭头距面板左右边缘的最小间距，避免贴在圆角上

    let center = selectionRect.left + selectionRect.width / 2 - panelLeft;
    center = Math.max(MARGIN, Math.min(center, panelWidth - MARGIN));

    arrow.style.left = `${center - HALF}px`;
    // 面板在选区下方 -> 箭头贴面板顶部朝上指向选区；反之贴底部朝下
    arrow.classList.toggle('twh-arrow-up', placement === 'below');
    arrow.classList.toggle('twh-arrow-down', placement === 'above');
  }

  /* ============ 复制 ============ */

  const COPY_ANIM_DURATION = 700; // 复制成功后，按钮动画+图标复原前的展示时长（毫秒）

  function copySelection() {
    if (!savedRange) return;
    const btn = panelEl && panelEl.querySelector('[data-action="copy"]');
    const text = savedRange.toString();
    const done = () => playCopyAnimation(btn);

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, cb) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } catch (e) {
      /* 忽略 */
    }
    document.body.removeChild(ta);
    cb && cb();
  }

  // 不再用气泡提示"已复制"，也不再把图标换成 ✅ 表情——
  // 复制图标保持不变，只是底色短暂变为绿色（与"清除"按钮确认态的红色相呼应）并轻微弹一下
  function playCopyAnimation(btn) {
    if (!btn) return;
    btn.classList.add('twh-btn-copied');
    if (btn._twhCopyAnim) btn._twhCopyAnim.cancel();
    btn._twhCopyAnim = btn.animate(
      [
        { transform: 'scale(1)' },
        { transform: 'scale(1.3)', offset: 0.4 },
        { transform: 'scale(1)' },
      ],
      { duration: 350, easing: 'ease' }
    );
    setTimeout(() => {
      if (!btn.isConnected) return; // 面板可能已经在动画播完前被关闭
      btn.classList.remove('twh-btn-copied');
    }, COPY_ANIM_DURATION);
  }

  /* ============ 高亮标记的添加 ============ */

  function collectTextNodes(range) {
    const root = range.commonAncestorContainer;

    // 选区完全落在单个文本节点内时，TreeWalker 无法从该节点本身出发遍历，需特殊处理
    if (root.nodeType === Node.TEXT_NODE) return [root];

    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_SKIP;
        if (node.parentElement && node.parentElement.closest('.twh-panel, script, style, textarea, input')) {
          return NodeFilter.FILTER_REJECT;
        }
        try {
          return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        } catch (e) {
          return NodeFilter.FILTER_SKIP;
        }
      },
    });

    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  }

  let groupSeq = 0;
  function makeGroupId() {
    // 同一次高亮操作（哪怕跨越多个文本节点/多层元素、被拆成好几个 span）
    // 共用同一个分组 id，方便之后整体撤销
    groupSeq += 1;
    return 'g' + Date.now().toString(36) + groupSeq.toString(36);
  }

  let highlightHistory = []; // 按创建顺序记录当前页面上仍存在的高亮分组 id，供 Ctrl/Cmd+Z 撤销使用

  function highlightRange(range, bgColor, fgColor, usedMode) {
    const nodes = collectTextNodes(range);
    const groupId = makeGroupId();
    let wrapped = false;

    nodes.forEach((node) => {
      const isStart = node === range.startContainer;
      const isEnd = node === range.endContainer;
      const start = isStart ? range.startOffset : 0;
      const end = isEnd ? range.endOffset : node.nodeValue.length;
      if (start >= end) return;

      let target = node;
      if (end < target.nodeValue.length) target.splitText(end);
      if (start > 0) target = target.splitText(start);

      wrapWithHighlight(target, bgColor, fgColor, groupId, usedMode);
      wrapped = true;
    });

    if (wrapped) highlightHistory.push(groupId);
  }

  function wrapWithHighlight(textNode, bgColor, fgColor, groupId, usedMode) {
    const span = document.createElement('span');
    span.className = HL_CLASS;
    span.style.backgroundColor = bgColor;
    // 文字色固定用配色对里的另一版，不再依赖页面原本的文字颜色——
    // 选区里混了链接、代码等自带颜色的元素时，也不会因为撞色导致看不清
    span.style.color = fgColor;
    span.dataset.twhGroup = groupId;
    // 记录这条高亮是在浅色还是深色模式下创建的，供之后悬浮时的"取消"按钮据此换肤，
    // 而不是跟随用户当下面板碰巧切换到的模式
    span.dataset.twhMode = usedMode === 'dark' ? 'dark' : 'light';
    textNode.parentNode.insertBefore(span, textNode);
    span.appendChild(textNode);
  }

  function clearAllHighlights() {
    document.querySelectorAll('.' + HL_CLASS).forEach((span) => {
      const parent = span.parentNode;
      if (!parent) return;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
      parent.normalize();
    });
    highlightHistory = [];
  }

  /* ============ 悬浮取消单条高亮 ============ */
  // 整体思路：不再单纯依赖 mouseover/mouseout 的 target/relatedTarget 来判断“鼠标去哪了”——
  // 按钮和高亮文本之间总有几像素的空隙，路径上也可能蹭到旁边另一条高亮，这些都不属于
  // 任何一方监听的元素，靠 relatedTarget 链式判断很容易漏判，导致按钮过早消失或被误切换。
  // 改为持续跟踪鼠标坐标，用“当前高亮 + 取消按钮”的外接矩形（并扩展一点缓冲）作为一个
  // 整体的安全区域：只要坐标还落在这个区域里，不管具体经过哪个元素，都不隐藏也不切换。

  function firstRectOf(mark) {
    const rects = mark.getClientRects();
    return rects[0] || mark.getBoundingClientRect();
  }

  function currentSafeZone() {
    if (!hoveredMark) return null;
    const mr = firstRectOf(hoveredMark);
    let left = mr.left, right = mr.right, top = mr.top, bottom = mr.bottom;
    if (unmarkBtn) {
      const br = unmarkBtn.getBoundingClientRect();
      left = Math.min(left, br.left);
      right = Math.max(right, br.right);
      top = Math.min(top, br.top);
      bottom = Math.max(bottom, br.bottom);
    }
    return {
      left: left - UNMARK_ZONE_MARGIN,
      right: right + UNMARK_ZONE_MARGIN,
      top: top - UNMARK_ZONE_MARGIN,
      bottom: bottom + UNMARK_ZONE_MARGIN,
    };
  }

  function pointInZone(x, y, zone) {
    return !!zone && x >= zone.left && x <= zone.right && y >= zone.top && y <= zone.bottom;
  }

  function onDocMouseOver(e) {
    if (!enabled) return;
    const mark = e.target.closest && e.target.closest('.' + HL_CLASS);
    if (!mark) return;

    if (!hoveredMark) {
      // 当前没有按钮在显示，直接显示
      hoveredMark = mark;
      showUnmarkButton(mark);
      return;
    }

    if (mark === hoveredMark) {
      clearTimeout(unmarkHideTimer);
      return;
    }

    // 碰到的是另一条高亮：如果这个坐标其实还落在当前按钮的安全区域内
    // （两行高亮离得近时很常见），就当作只是路过，不切换
    if (pointInZone(lastMouseX, lastMouseY, currentSafeZone())) return;

    // 确实移到了别的高亮上，缓冲一下确认不是路过，再真正切换过去
    if (switchCandidateMark !== mark) {
      switchCandidateMark = mark;
      clearTimeout(switchCandidateTimer);
      switchCandidateTimer = setTimeout(() => {
        if (switchCandidateMark === mark) {
          hoveredMark = mark;
          showUnmarkButton(mark);
        }
      }, UNMARK_SWITCH_DELAY);
    }
  }

  // 鼠标移出整个页面（比如移到地址栏、切到别的窗口）时不会再有 mousemove 事件，
  // 靠 mousemove 的安全区域判断兜不住，这里单独兜底隐藏
  function onDocMouseOut(e) {
    if (!e.relatedTarget && !e.toElement) {
      scheduleHideUnmarkButton();
    }
  }

  function onDocMouseMove(e) {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    if (!hoveredMark) return;

    if (pointInZone(e.clientX, e.clientY, currentSafeZone())) {
      clearTimeout(unmarkHideTimer);
    } else {
      scheduleHideUnmarkButton();
    }
  }

  function scheduleHideUnmarkButton() {
    clearTimeout(unmarkHideTimer);
    unmarkHideTimer = setTimeout(hideUnmarkButton, UNMARK_HIDE_DELAY);
  }

  function hideUnmarkButton() {
    clearTimeout(switchCandidateTimer);
    switchCandidateMark = null;
    if (unmarkBtn) {
      unmarkBtn.remove();
      unmarkBtn = null;
    }
    hoveredMark = null;
  }

  // ❌ 是彩色表情符号，不受 CSS color 影响，导致按钮理论上换了底色但"X"本身颜色不变；
  // 改用 currentColor 描边的 SVG 叉号，让图标颜色真正跟随 .twh-theme-light/dark 切换
  const UNMARK_ICON_SVG =
    '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" ' +
    'stroke-width="2.5" stroke-linecap="round"><path d="M6 6L18 18M18 6L6 18"/></svg>';

  function showUnmarkButton(mark) {
    if (unmarkBtn) unmarkBtn.remove();

    // 用这条高亮自己记录的 twhMode，而不是当前全局 mode——
    // 这样悬浮在一条"深色模式下创建"的高亮上时，取消按钮也会以深色模式的皮肤出现，
    // 和当初创建它时面板的样子保持一致，给用户一个"这是哪套颜色"的心理暗示。
    // 页面浅色 -> 黑底白 X；页面深色 -> 白底黑 X（见 content.css 中 twh-unmark-btn 的主题配色）
    const markMode = mark.dataset.twhMode === 'dark' ? 'dark' : 'light';
    unmarkBtn = document.createElement('button');
    unmarkBtn.className = 'twh-unmark-btn ' + (markMode === 'light' ? 'twh-theme-light' : 'twh-theme-dark');
    unmarkBtn.innerHTML = UNMARK_ICON_SVG;
    unmarkBtn.addEventListener('mousedown', (e) => e.preventDefault());
    unmarkBtn.addEventListener('click', () => {
      unwrapMark(mark);
      hideUnmarkButton();
    });

    document.body.appendChild(unmarkBtn);
    positionUnmarkButton(mark);
  }

  function positionUnmarkButton(mark) {
    if (!unmarkBtn) return;
    const rects = mark.getClientRects();
    const rect = rects[0] || mark.getBoundingClientRect();

    unmarkBtn.style.visibility = 'hidden';
    const bw = unmarkBtn.offsetWidth;
    const bh = unmarkBtn.offsetHeight;

    let top = rect.top - bh - 6;
    if (top < 0) top = rect.bottom + 6; // 顶部空间不够时改放到文本下方

    let left = rect.left + rect.width / 2 - bw / 2;
    left = Math.max(4, Math.min(left, window.innerWidth - bw - 4));

    unmarkBtn.style.left = `${left}px`;
    unmarkBtn.style.top = `${top}px`;
    unmarkBtn.style.visibility = 'visible';
  }

  function unwrapMark(mark) {
    const groupId = mark.dataset.twhGroup;
    removeHighlightGroup(groupId, mark);
    if (groupId) removeFromHistory(groupId);
  }

  function removeHighlightGroup(groupId, fallbackMark) {
    // 同一次高亮操作可能因跨越多个文本节点/元素而被拆分成若干个 span，
    // 这里按分组 id 一次性全部移除，而不是只移除某一小段
    const group = groupId
      ? document.querySelectorAll('.' + HL_CLASS + '[data-twh-group="' + CSS.escape(groupId) + '"]')
      : [fallbackMark];

    group.forEach((span) => {
      const parent = span.parentNode;
      if (!parent) return;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
      parent.normalize();
    });
  }

  function removeFromHistory(groupId) {
    const idx = highlightHistory.indexOf(groupId);
    if (idx !== -1) highlightHistory.splice(idx, 1);
  }

  function undoLastHighlight() {
    const groupId = highlightHistory.pop();
    if (!groupId) return false;

    removeHighlightGroup(groupId);
    // 如果鼠标正悬浮在被撤销的这条高亮上，同步收起取消按钮，避免按钮悬空
    if (hoveredMark && hoveredMark.dataset.twhGroup === groupId) {
      hideUnmarkButton();
    }
    return true;
  }

  /* ============ 键盘快捷键 ============ */

  function isEditableTarget(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || !!el.isContentEditable;
  }

  function onDocKeyDown(e) {
    if (!enabled) return;

    // 全局撤销上一次高亮：Ctrl/Cmd+Z。不要求面板处于打开状态。
    // 只有在“确实存在可撤销的高亮”时才拦截按键，避免影响网页本身的撤销功能
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
      if (isEditableTarget(e.target)) return;
      if (highlightHistory.length === 0) return;
      e.preventDefault();
      undoLastHighlight();
      return;
    }

    if (!panelEl) return; // 以下快捷键仅在面板打开时生效

    if (e.key === 'Escape') {
      hidePanel();
      window.getSelection().removeAllRanges();
      return;
    }

    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key >= '1' && e.key <= '7') {
      const idx = Number(e.key) - 1;
      const bg = mode === 'light' ? LIGHT_COLORS[idx] : DARK_COLORS[idx];
      const fg = mode === 'light' ? DARK_COLORS[idx] : LIGHT_COLORS[idx];
      if (bg && savedRange) {
        e.preventDefault();
        highlightRange(savedRange, bg, fg, mode);
        hidePanel();
        window.getSelection().removeAllRanges();
      }
    }
  }

  /* ============ 事件绑定 ============ */
  // 注：chrome.storage.local 仅用于保存“插件开启/暂停”这一个偏好开关；
  // 高亮标记本身依然只存在于当前 DOM 中，不做任何持久化，
  // 关闭或刷新页面后高亮自然消失。

  document.addEventListener('mouseover', onDocMouseOver);
  document.addEventListener('mouseout', onDocMouseOut);
  document.addEventListener('mousemove', onDocMouseMove);
  document.addEventListener('keydown', onDocKeyDown);

  document.addEventListener('mouseup', (e) => {
    if (panelEl && panelEl.contains(e.target)) return;
    if (!enabled) return;
    // 只响应鼠标左键；e.detail 为本次点击序列的连续次数：
    // 1 = 单击拖拽选中，2/3 = 双击选词、三击选段等——这些情况不弹出面板
    if (e.button !== 0 || e.detail !== 1) return;
    setTimeout(showPanelForSelection, 0);
  });

  document.addEventListener('mousedown', (e) => {
    if (panelEl && !panelEl.contains(e.target)) {
      hidePanel();
    }
  });

  window.addEventListener(
    'scroll',
    () => {
      hidePanel();
      hideUnmarkButton();
    },
    true
  );
  window.addEventListener('resize', () => {
    hidePanel();
    hideUnmarkButton();
  });
})();