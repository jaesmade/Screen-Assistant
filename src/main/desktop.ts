import {
  app,
  BrowserWindow,
  globalShortcut,
  Menu,
  nativeImage,
  screen,
  Tray,
} from "electron";
import { join } from "node:path";

export const OVERLAY_SHORTCUT = "CommandOrControl+Shift+Space";
let overlay: BrowserWindow | null = null;
let tray: Tray | null = null;
let registered = false;
let quitting = false;
let configure: (window: BrowserWindow) => void;
let abortWindow: (window: BrowserWindow) => void;
let openMain: () => void;
let renderer: () => string;
const preload = join(__dirname, "../preload/index.js");

export function desktopState() {
  return {
    shortcut: OVERLAY_SHORTCUT,
    shortcutRegistered: registered,
    overlayVisible: Boolean(overlay?.isVisible()),
  };
}
export function hideOverlay() {
  if (!overlay) return;
  abortWindow(overlay);
  overlay.hide();
}
export function showDesk() {
  hideOverlay();
  openMain();
}
export function keepInTray() {
  return !quitting && Boolean(tray);
}
export function showOverlay() {
  if (!overlay || overlay.isDestroyed()) {
    overlay = new BrowserWindow({
      width: 520,
      height: 740,
      minWidth: 400,
      minHeight: 480,
      show: false,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      backgroundColor: "#f7f7fa",
      title: "Study Desk · Quick overlay",
      webPreferences: {
        preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    const win = overlay;
    configure(win);
    win.on("close", (event) => {
      if (!quitting) {
        event.preventDefault();
        hideOverlay();
      }
    });
    win.on("closed", () => {
      overlay = null;
    });
    const url = new URL(renderer());
    url.hash = "overlay";
    void win.loadURL(url.href);
  }
  const area = screen.getDisplayNearestPoint(
    screen.getCursorScreenPoint(),
  ).workArea;
  const width = Math.min(overlay.getBounds().width, area.width);
  const height = Math.min(overlay.getBounds().height, area.height);
  overlay.setBounds({
    x: area.x + Math.max(0, area.width - width - 16),
    y: area.y + Math.min(20, Math.max(0, area.height - height)),
    width,
    height,
  });
  overlay.show();
  overlay.focus();
}
export function isOverlayContents(contents: Electron.WebContents) {
  return overlay?.webContents === contents;
}
export async function withoutOverlay<T>(
  contents: Electron.WebContents,
  capture: () => Promise<T>,
): Promise<T> {
  const window = overlay;
  if (!window || window.webContents !== contents || !window.isVisible())
    return capture();
  window.hide();
  try {
    // Let the desktop compositor remove the floating panel before sampling a screen.
    await new Promise((resolve) => setTimeout(resolve, 120));
    return await capture();
  } finally {
    if (!window.isDestroyed()) {
      window.show();
      window.focus();
    }
  }
}
export function setupDesktop(options: {
  configureWindow: (window: BrowserWindow) => void;
  abortOwned: (window: BrowserWindow) => void;
  showMain: () => void;
  rendererUrl: () => string;
}) {
  configure = options.configureWindow;
  abortWindow = options.abortOwned;
  openMain = options.showMain;
  renderer = options.rendererUrl;
  try {
    registered = globalShortcut.register(OVERLAY_SHORTCUT, () => {
      if (overlay?.isVisible()) hideOverlay();
      else showOverlay();
    });
  } catch {
    registered = false;
  }
  try {
    const icon = app.isPackaged
      ? join(process.resourcesPath, "icon.png")
      : join(__dirname, "../../build/icon.png");
    tray = new Tray(nativeImage.createFromPath(icon));
    tray.setToolTip("Study Desk · Ctrl+Shift+Space");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Open Study Desk", click: showDesk },
        { label: "Quick overlay · Ctrl+Shift+Space", click: showOverlay },
        { type: "separator" },
        { label: "Quit Study Desk", click: () => app.quit() },
      ]),
    );
    tray.on("double-click", showDesk);
  } catch {
    console.warn(
      "Tray icon unavailable; keep the study desk open to use its controls.",
    );
  }
  app.on("before-quit", () => {
    quitting = true;
  });
  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
    tray?.destroy();
  });
}
