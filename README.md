# Hyliter - Lightweight Web Highlighter

<p align="center">
  <a href="#简体中文">简体中文</a> | 
  <a href="#english">English</a> | 
  <a href="#español">Español</a>
</p>

<p align="center">
  <em>A fast, ephemeral, and privacy-focused text marker for any webpage.</em>
</p>

---

## 简体中文

**Hyliter** 是一款专为“无痕阅读”设计的轻量级网页文本高亮扩展。选中文本即可高亮，不强制注册账号，没有繁重的云端同步。它就像您浏览器里的一张“数字草稿纸”，用完即走，绝对的隐私安全。

### ✨ 核心特性 (Features)
- 🎨 **沉浸式多色高亮**：选中文本弹出轻量级面板，7 种颜色可选，一键完成高亮标记。
- ⚡ **键盘驱动 (Keyboard-First)**：支持数字键 `1-7` 快速选色、`Esc` 关闭面板、`Ctrl/Cmd + Z` 快捷撤销。减少鼠标依赖，保持专注流。
- 🌓 **原生深浅色自适应**：面板会根据选区所在区域的 DOM 背景明暗，自动切换浅色/深色皮肤，不刺眼。
- 🛡️ **阅后即焚 (零存储负担)**：高亮只存在于当前页面，刷新或关闭页面后自动消失。不写入任何本地文件，不上传云端，**100% 保护数据隐私**。
- 🎯 **防误触与精准撤销**：鼠标悬浮即可单条精准撤销；“清除全部”按钮采用 2.5 秒跳动二次确认设计，告别手滑烦恼。

### 🌐 兼容性
本插件基于 Chrome Extension Manifest V3 标准开发，适用于 Chromium 内核浏览器：
- 🌐 **Google Chrome** | 🔷 **Microsoft Edge** | 🦁 **Brave Browser** | 🔴 **Opera / Vivaldi** 等

支持 **open / closed Shadow DOM**、嵌套组件与 slot 内文本的高亮。现代 Chromium 支持跨多个 ShadowRoot 划词，并将同一次操作作为一组撤销、悬浮取消或清除；各片段会按所在位置的背景明暗配色。closed root 的访问依赖 Chromium 扩展提供的能力。旧浏览器缺少跨树选区能力时，仅处理能准确定位的单个 root 内选区，跳过无法准确定位的跨 root 选区。

选色面板与悬浮取消按钮使用浏览器 Top Layer 显示，支持在 Shadow DOM 的 Popover 弹窗和模态对话框内操作。弹窗关闭时，相关插件浮层会一起清理。

### 🛠️ 安装方法

#### 方法一：从应用商店安装 (推荐)
*🚀 即将上架 Chrome Web Store 敬请期待！*

#### 方法二：开发者模式安装 (本地使用 / 源码下载)
1. 点击本页面右上角的 `Code` -> `Download ZIP` 下载源码并解压。
2. 打开浏览器扩展管理页面：Chrome 输入 `chrome://extensions/` ，Edge 输入 `edge://extensions/`。
3. 开启页面右上角的 **“开发者模式”**。
4. 点击左上角的 **“加载已解压的扩展程序”**，选择解压后的项目根目录（包含 `manifest.json` 的文件夹）即可。

### ⚙️ 进阶操作与隐私说明
- **全局启用/暂停**：点击浏览器工具栏的 Hyliter 图标可切换开关状态（跨标签页同步）。暂停后，已存在的高亮将保留，但不再响应新的划词操作。
- **数据与隐私声明**：Hyliter 坚持极简架构。您的所有高亮数据**仅**存在于当前页面的内存中。扩展仅使用 `chrome.storage.local` 保存您的“启用/暂停”开关状态，除此之外不收集、不存储任何用户数据。

---

## English

**Hyliter** is a lightweight, clean Chrome extension for highlighting text on web pages. Designed as a purely ephemeral web highlighter, it requires no login, no cloud sync, and leaves no digital footprint. It's your temporary digital scratchpad.

### ✨ Key Features
- 🎨 **Multi-Color Highlighting**: Select text to reveal a fast popup panel with 7 distinct colors.
- ⚡ **Keyboard-First Workflow**: Use number keys `1-7` to pick colors, `Esc` to close the panel, and `Ctrl/Cmd + Z` to undo. Stay focused and minimize mouse usage.
- 🌓 **Native Dark Mode Integration**: The popup panel automatically switches between light and dark themes based on the background color behind your text selection.
- 🛡️ **Ephemeral & Privacy-Focused (Read-after-burn)**: Highlights exist only on the current page's DOM. They disappear completely upon reload or closing the tab. Zero data storage, zero cloud uploads. 
- 🎯 **Smart Undo & Clear**: Hover over any highlight to remove it individually. The "Clear All" button features a 2.5-second pulsing confirmation state to prevent accidental clicks.

### 🌐 Compatibility
Built on Chrome Extension Manifest V3 for Chromium-based browsers:
- 🌐 **Google Chrome** | 🔷 **Microsoft Edge** | 🦁 **Brave Browser** | 🔴 **Opera / Vivaldi**

Supports text in **open and closed Shadow DOM**, nested components, and slots. Modern Chromium supports selections across multiple ShadowRoots, with each operation removed or undone as one group and each fragment colored for its local background. Closed roots require Chromium's extension API. Older browsers without composed selection support handle accurately resolved selections within one root and skip ambiguous selections across roots.

The color panel and hover removal button use the browser's Top Layer to remain accessible inside Shadow DOM popovers and modal dialogs. Their floating controls are removed when the containing popup closes.

### 🛠️ Installation

#### Method 1: Install from Web Store (Recommended)
*🚀 Coming soon to Chrome Web Store!*

#### Method 2: Developer Mode (Local Installation)
1. Click `Code` -> `Download ZIP` at the top right to download and extract the source code.
2. Navigate to your browser's extension management page (`chrome://extensions/` or `edge://extensions/`).
3. Toggle on **"Developer mode"** in the top right corner.
4. Click **"Load unpacked"** and select the root folder of the extracted project (the one containing `manifest.json`).

### ⚙️ Advanced Usage & Privacy
- **Toggle Enable/Pause**: Click the extension icon in the toolbar to toggle its state (syncs across tabs). When paused, existing highlights remain, but new selections won't trigger the panel.
- **Data & Privacy Policy**: Hyliter respects your privacy. Highlights are purely ephemeral and never persisted. We only use `chrome.storage.local` to remember your enabled/paused preference. No tracking, no data collection.

---

## Español

**Hyliter** es una extensión de Chrome ligera y privada para resaltar texto en páginas web. Diseñada como un marcador de texto puramente temporal: no requiere registro, no se sincroniza en la nube y no deja rastro digital.

### ✨ Características Principales
- 🎨 **Múltiples Colores**: Selecciona texto para abrir un panel con 7 colores disponibles para resaltar al instante.
- ⚡ **Atajos de Teclado**: Usa las teclas numéricas `1-7` para elegir colores, `Esc` para cerrar el panel y `Ctrl/Cmd + Z` para deshacer. 
- 🌓 **Integración Nativa (Modo Oscuro)**: El panel cambia automáticamente entre apariencia clara u oscura adaptándose al fondo de la página web.
- 🛡️ **100% Privado y Temporal**: Los resaltados solo existen en el DOM de la página actual y desaparecen al recargarla o cerrarla. No se guarda nada en disco ni en la nube.
- 🎯 **Deshacer Inteligente**: Pasa el cursor sobre un resaltado para borrar solo ese. El botón de "Borrar Todo" cuenta con una confirmación visual de 2,5 segundos para evitar borrados accidentales.

### 🌐 Compatibilidad
Desarrollada bajo el estándar Chrome Extension Manifest V3 para navegadores Chromium:
- 🌐 **Google Chrome** | 🔷 **Microsoft Edge** | 🦁 **Brave Browser** | 🔴 **Opera / Vivaldi**

Admite texto en **Shadow DOM abierto y cerrado**, componentes anidados y slots. Chromium moderno permite seleccionar texto entre varios ShadowRoots y deshacer o eliminar cada operación como un solo grupo, adaptando los colores al fondo de cada fragmento. El acceso a raíces cerradas requiere la API de extensiones de Chromium. Los navegadores antiguos sin selecciones compuestas solo procesan selecciones que pueden localizar con precisión dentro de una raíz y omiten las selecciones ambiguas entre raíces.

El panel de colores y el botón de eliminación usan la capa superior del navegador (Top Layer) para funcionar dentro de popovers y diálogos modales en Shadow DOM. Sus controles flotantes se eliminan al cerrar la ventana que los contiene.

### 🛠️ Instalación

#### Método 1: Chrome Web Store (Recomendado)
*🚀 ¡Próximamente disponible!*

#### Método 2: Modo Desarrollador (Instalación Local)
1. Haz clic en `Code` -> `Download ZIP` para descargar y extraer el código fuente.
2. Abre la página de extensiones en tu navegador (`chrome://extensions/` o `edge://extensions/`).
3. Activa el **"Modo de desarrollador"** (Developer mode).
4. Haz clic en **"Cargar descomprimida"** (Load unpacked) y selecciona la carpeta raíz del proyecto extraído.

### ⚙️ Uso Avanzado y Privacidad
- **Activar/Pausar**: Haz clic en el icono de la barra de herramientas para pausar la extensión. Al pausar, no se eliminan los resaltados actuales, pero se ignoran nuevas selecciones.
- **Política de Privacidad**: Hyliter no recopila datos. La extensión solo utiliza `chrome.storage.local` para recordar si la extensión está activada o pausada.

---

## 📄 License

MIT License © 2026 [lasdocas](https://github.com/lasdocas)
