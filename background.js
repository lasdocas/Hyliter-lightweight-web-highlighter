// Hyliter 后台脚本
// 职责：响应工具栏图标的左键点击，在“开启/暂停”之间切换整个插件，
// 并在图标上用徽标文字显示当前状态（ON / OFF）。
// 开关状态本身是一个“用户偏好”，与页面高亮标记（不持久化）无关，
// 因此这里使用 chrome.storage.local 保存，保证重启浏览器后状态仍然一致。

const STORAGE_KEY = 'hyliterEnabled';
const BADGE_ON_BG = '#2E7D32';  // 绿色：插件开启
const BADGE_OFF_BG = '#9AA0A6'; // 灰色：插件暂停

async function getEnabled() {
  const result = await chrome.storage.local.get({ [STORAGE_KEY]: true });
  return result[STORAGE_KEY];
}

async function applyBadge(enabled) {
  await chrome.action.setBadgeText({ text: enabled ? 'ON' : 'OFF' });
  await chrome.action.setBadgeBackgroundColor({
    color: enabled ? BADGE_ON_BG : BADGE_OFF_BG,
  });
}

async function syncBadge() {
  const enabled = await getEnabled();
  await applyBadge(enabled);
}

chrome.runtime.onInstalled.addListener(syncBadge);
chrome.runtime.onStartup.addListener(syncBadge);
syncBadge();

// 左键点击工具栏图标：切换开启/暂停状态
chrome.action.onClicked.addListener(async () => {
  const enabled = await getEnabled();
  const next = !enabled;
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  await applyBadge(next);
  // 其余标签页的 content script 通过监听 chrome.storage.onChanged 自动同步状态，
  // 无需在这里手动逐个 tab 发消息。
});
