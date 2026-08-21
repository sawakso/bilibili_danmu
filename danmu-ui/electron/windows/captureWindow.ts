import { BrowserWindow } from "electron";
import path from "path";
import { mainWindowUrl, isProduction, distDir } from '../consts'
import { getConfig, setConfig } from '../config'

// OBS 窗口捕获模式：一个独立的、非全屏的透明弹幕窗口（类似 QQ 聊天窗口）。
// 用户把它拖到屏幕上任意位置，在 OBS 里用「游戏捕获 -> 捕获特定窗口 -> 允许透明」
// （或「窗口捕获 -> Windows 10 (1903 and up)」）抓取即可得到透明背景的弹幕层。
// 与全屏 Overlay 的区别：窗口可移动/缩放、不置顶、有独立标题，专为 OBS 捕获设计。
let captureWindow: BrowserWindow | null = null;

const createCaptureWindow = (info?: any): BrowserWindow => {
  // 已存在则直接显示并重发主播信息（幂等，避免重复建窗）
  if (captureWindow != null && !captureWindow.isDestroyed()) {
    if (info != null) captureWindow.webContents.send('receiveStreamerInfo', info)
    captureWindow.show()
    captureWindow.focus()
    return captureWindow
  }

  // 恢复上次的窗口位置/尺寸
  const saved = getConfig().captureBounds

  captureWindow = new BrowserWindow({
    show: false,
    transparent: true,
    frame: false,
    resizable: true,
    width: saved?.width ?? 520,
    height: saved?.height ?? 720,
    x: saved?.x,
    y: saved?.y,
    minWidth: 240,
    minHeight: 160,
    alwaysOnTop: false,        // 不置顶：OBS 捕获不要求窗口可见，避免挡游戏画面
    skipTaskbar: false,        // 保留任务栏入口，用户可随时找到/关闭
    title: 'Livedanmu 弹幕窗（OBS 捕获）',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: true,
      preload: path.join(__dirname, "../electron/capture-preload.js"),
    },
  });

  captureWindow.once('ready-to-show', () => captureWindow?.show())

  // 移动/缩放后记住位置尺寸，下次打开恢复原位
  const saveBounds = () => {
    if (captureWindow != null && !captureWindow.isDestroyed()) {
      setConfig({ captureBounds: captureWindow.getBounds() })
    }
  }
  captureWindow.on('move', saveBounds)
  captureWindow.on('resize', saveBounds)

  // 打包后从本地 dist 加载 Capture 路由（hash 模式 -> #/capture）；开发期走 Vite dev server
  const loadCapture = isProduction
    ? captureWindow.loadFile(path.join(distDir, 'index.html'), { hash: '/capture' })
    : captureWindow.loadURL(`${mainWindowUrl}/#/capture`)

  loadCapture.then(() => {
    if (info != null && captureWindow != null && !captureWindow.isDestroyed()) {
      captureWindow.webContents.send('receiveStreamerInfo', info)
    }
  });

  captureWindow.on('closed', () => {
    captureWindow = null
  })

  return captureWindow
}

const getCaptureWindow = (): BrowserWindow | null => captureWindow

const closeCaptureWindow = (): void => {
  if (captureWindow != null && !captureWindow.isDestroyed()) {
    captureWindow.close()
  }
  captureWindow = null
}

export { createCaptureWindow, getCaptureWindow, closeCaptureWindow, captureWindow }
