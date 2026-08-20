import path from "path";
import fs from "fs";
import net from "net";
import { spawn } from "child_process";
import { app, BrowserWindow, ipcMain, globalShortcut } from "electron";
import { runSocketAndBackgroundService, liveBackend } from './backgroundService'
import { loadConfig, getConfig, setConfig } from './config'
import { createLoadingWindow, loadingWindow } from './windows/loadingWindow'
import { createOverlayWindow, overlayWindow } from './windows/overlayWindow'
import { gotTheLock, mainWindowUrl, windowsIsTrueMacIsFalse, isDevelopment, isProduction, distDir } from './consts'
import createTray from "./components/appTray";


let mainWindow: BrowserWindow;
let isCloseByTray = false
let isOverlayIgnoreMouse: boolean = true;
let isManualSetCover: boolean = false;
let isOverlayWindowsReady = false
let lastDanmuSettings: any = null // 缓存最新弹幕设置，Overlay 就绪后补发

// 已注册的"鼠标穿透"快捷键加速器（用于改键时先反注册旧的）
let registeredHotkey: string | null = null

// 动态注册"切换鼠标穿透"全局快捷键：读取用户配置，注册失败（被占用/非法）时优雅返回 false
const registerToggleShortcut = (): boolean => {
  if (registeredHotkey) {
    globalShortcut.unregister(registeredHotkey)
    registeredHotkey = null
  }
  const acc = (getConfig().mousePenetrationHotkey || 'CommandOrControl+Shift+G').trim()
  try {
    const ok = globalShortcut.register(acc, () => {
      // 未加载完成前快捷键不可触发
      if (!isOverlayWindowsReady || overlayWindow == null || overlayWindow.isDestroyed()) return
      isOverlayIgnoreMouse = !isOverlayIgnoreMouse
      overlayWindow.setIgnoreMouseEvents(isOverlayIgnoreMouse)
      overlayWindow.webContents.send('ignoreMouse')
    })
    if (ok) {
      registeredHotkey = acc
      return true
    }
    console.warn('[hotkey] 注册失败（可能被系统/其他软件占用）:', acc)
    return false
  } catch (err) {
    console.warn('[hotkey] 注册异常:', err)
    return false
  }
}

// ---- "弹幕区域调整"模式 ----
// 进入：Overlay 解除鼠标穿透、显示可拖拽/缩放的编辑框；退出：恢复穿透并保存位置尺寸。
// 穿透状态统一由渲染层（Overlay.vue）根据 editMode 控制，主进程只负责切换状态与通知。
let isOverlayEditing = false
const toggleOverlayEdit = (): void => {
  if (overlayWindow == null || overlayWindow.isDestroyed()) return
  isOverlayEditing = !isOverlayEditing
  console.log('[overlay] 区域调整模式:', isOverlayEditing ? '开' : '关')
  overlayWindow.webContents.send('overlay-edit-mode', isOverlayEditing)
}

// 注册"进入/退出区域调整"全局快捷键（默认 CommandOrControl+Shift+E，可自定义）
let registeredEditHotkey: string | null = null
const registerOverlayEditShortcut = (): boolean => {
  if (registeredEditHotkey) {
    globalShortcut.unregister(registeredEditHotkey)
    registeredEditHotkey = null
  }
  const acc = (getConfig().overlayEditHotkey || 'CommandOrControl+Shift+E').trim()
  try {
    const ok = globalShortcut.register(acc, () => toggleOverlayEdit())
    if (ok) {
      registeredEditHotkey = acc
      return true
    }
    console.warn('[hotkey] 区域调整快捷键注册失败（可能被系统/其他软件占用）:', acc)
    return false
  } catch (err) {
    console.warn('[hotkey] 区域调整快捷键注册异常:', err)
    return false
  }
}

// 打包后随应用自带的 .NET 弹幕后端（LiveServer）。启动后等待其监听端口就绪，供渲染端连接。
let liveServerProc: any = null
const LIVE_SERVER_PORT = 5000

// 轮询本地端口是否可连通（最多等待 timeoutMs）
const waitForPort = (port: number, timeoutMs: number): Promise<boolean> => {
  const start = Date.now()
  return new Promise((resolve) => {
    const tryOnce = () => {
      const sock = net.connect(port, '127.0.0.1')
      sock.setTimeout(800)
      sock.once('connect', () => { sock.destroy(); resolve(true) })
      sock.once('error', () => { sock.destroy(); retry() })
      sock.once('timeout', () => { sock.destroy(); retry() })
    }
    const retry = () => {
      if (Date.now() - start > timeoutMs) { resolve(false); return }
      setTimeout(tryOnce, 400)
    }
    tryOnce()
  })
}

const startLiveServer = (): Promise<void> => {
  return new Promise((resolve) => {
    // 开发期由用户自行 dotnet run 启动后端，这里不接管
    if (!isProduction) { resolve(); return }

    const exePath = path.join(process.resourcesPath, 'backend', 'LiveServer', 'LiveServer.exe')
    if (!fs.existsSync(exePath)) {
      console.warn('[backend] 未找到打包的后端 LiveServer.exe，弹幕功能将不可用：', exePath)
      resolve(); return
    }
    try {
      liveServerProc = spawn(exePath, [], { cwd: path.dirname(exePath), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
      liveServerProc.stdout?.on('data', (d: Buffer) => console.log('[LiveServer]', d.toString().trim()))
      liveServerProc.stderr?.on('data', (d: Buffer) => console.warn('[LiveServer]', d.toString().trim()))
      liveServerProc.on('error', (e: any) => console.warn('[backend] LiveServer 启动异常：', e?.message || e))
      console.log('[backend] 已启动 LiveServer：', exePath)
    } catch (e) {
      console.warn('[backend] spawn LiveServer 失败，弹幕功能将不可用：', e)
      resolve(); return
    }
    // 等待后端端口就绪（最多 25s），超时也不阻塞 UI 启动
    waitForPort(LIVE_SERVER_PORT, 25000).then((ok) => {
      console.log(ok ? '[backend] LiveServer 端口 5000 已就绪' : '[backend] 等待 LiveServer 超时（渲染端会自动重连）')
      resolve()
    })
  })
}

// ---------------------------------------------------------------------------------------------


if (isDevelopment)
  app.commandLine.appendSwitch('ignore-certificate-errors')


if (!gotTheLock) {
  app.quit()
} else {

  //尝试多开  回调参数 event, commandLine, workingDirectory
  app.on('second-instance', () => {
    //用户正在尝试运行第二个实例，我们需要让焦点指向我们的窗口
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {

    if (process.platform == 'darwin') {
      // mac特定api
      app.dock.setIcon(path.join(__dirname, '../electron/app-100.png'))
    }

    // 加载用户配置并注册全局快捷键（Overlay 创建后会再次注册，幂等）
    loadConfig()
    registerToggleShortcut()
    registerOverlayEditShortcut()

    // 启动随包自带的 .NET 弹幕后端（开发期不接管）；后台异步等待端口就绪，不阻塞 UI
    startLiveServer()

  }).then(() => {

    createLoadingWindow(createMainWindow);

    // mac系统处理
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createLoadingWindow(createMainWindow);
      }
    });
  })
}


const createMainWindow = () => {

  mainWindow = new BrowserWindow({
    show: false, //由loadingWindow展示窗体
    frame: false,
    titleBarStyle: "hidden",//customButtonsOnHover 可以用html自定义缩小,放大,关闭按钮(可以,但是没必要,会缺少平台特定功能)
    titleBarOverlay: {
      color: 'rgba(2, 3, 4, 0)',
      // symbolColor: "rgba(36,41,46,0.9)"
      // height: 5
    }, // 需要设置titleBarStyle才生效, mac上设置:true , windows使用该对象不为undefined即可
    resizable: true,
    height: 640,
    width: 480,
    title: 'Live chat',
    webPreferences: {
      devTools: isDevelopment,
      contextIsolation: true, // 是否开启隔离上下文
      nodeIntegration: true, // 渲染进程使用Node API
      preload: path.join(__dirname, "../electron/main-preload.js"), // 需要引用js文件
    },
  });


  mainWindow.once('ready-to-show', () => {
    //一定要先隐藏,不然会有视觉问题
    loadingWindow.hide()
    loadingWindow.close()
    mainWindow.show()
  })

  mainWindow.on('close', (e) => {
    if (!isCloseByTray) {
      e.preventDefault()
      mainWindow.hide()
    } else {

      if (liveBackend != null) {
        liveBackend.kill()
      }

      if (overlayWindow != null) {
        overlayWindow.hide()
        overlayWindow.close()
      }
    }
  })


  // 打包后从本地 dist 加载 UI（不再依赖远程服务器）；开发期走 Vite  dev server
  const loadMain = isProduction
    ? mainWindow.loadFile(path.join(distDir, 'index.html'))
    : mainWindow.loadURL(mainWindowUrl)

  loadMain.then(() => {

    createTray(() => {
      mainWindow?.setSkipTaskbar(false)
      mainWindow.show()
    }, () => {
      isManualSetCover = !isManualSetCover
    }, () => {
      isCloseByTray = true
      app.quit()
    })

  });
}



// 关闭窗口
app.on("window-all-closed", () => {
  if (!windowsIsTrueMacIsFalse) {
    return
  }
  app.quit();
});




// ipcMain listen event ----------------------------------------------------------------------------

// 确保只运行一次
ipcMain.once('runService', () => {

  runSocketAndBackgroundService(info => {

    if (info.method != "GameIsForeground") {
      if (mainWindow != null) {
        mainWindow.webContents.send(info.method, info)
      }
    } else {
      if (overlayWindow != null) {

        //手动设置覆盖,则始终为true
        if (isManualSetCover) {
          overlayWindow.webContents.send(info.method, {
            isForeground: true
          })
        } else {
          overlayWindow.webContents.send(info.method, info)
        }
      }
    }
  })
})



ipcMain.on('overlay', (e, info) => {

  createOverlayWindow(() => {
    // 注册（或重注册）全局快捷键，加速器来自用户配置
    registerToggleShortcut()
    registerOverlayEditShortcut()

    console.debug('send streamer info to overlay')
    overlayWindow.webContents.send('receiveStreamerInfo', info)
  })
})


ipcMain.on("overlay-isReady", () => {
  console.debug('overlay isReady');
  isOverlayWindowsReady = true
  // Overlay 就绪后补发最新弹幕设置，避免创建窗口前的设置丢失
  if (lastDanmuSettings != null && overlayWindow != null && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('danmu-settings', lastDanmuSettings)
  }
})


// 透传：Overlay 渲染进程请求主进程切换鼠标穿透
ipcMain.on('overlay:set-ignore-mouse', (e, ignore) => {
  if (overlayWindow != null) {
    overlayWindow.setIgnoreMouseEvents(ignore, { forward: !ignore })
  }
})

// 主窗口控制台 -> Overlay 同步弹幕设置
ipcMain.on('danmu-settings', (e, settings) => {
  lastDanmuSettings = settings
  if (overlayWindow != null && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('danmu-settings', settings)
  }
})

// 渲染端读取当前配置（如快捷键）
ipcMain.handle('get-config', () => {
  return getConfig()
})

// 渲染端设置并即时生效全局快捷键；返回是否注册成功
// key: 'mousePenetration'（默认）或 'overlayEdit'
ipcMain.handle('set-hotkey', (e, key: string, acc: string) => {
  const trimmed = (acc || '').trim()
  if (!trimmed) return { ok: false, error: 'empty' }
  if (key === 'overlayEdit') {
    setConfig({ overlayEditHotkey: trimmed })
    const ok = registerOverlayEditShortcut()
    return { ok, accelerator: getConfig().overlayEditHotkey }
  }
  setConfig({ mousePenetrationHotkey: trimmed })
  const ok = registerToggleShortcut()
  return { ok, accelerator: getConfig().mousePenetrationHotkey }
})

// Overlay 渲染层按钮触发"进入/退出区域调整"（与快捷键等效）
ipcMain.on('overlay:edit-mode', () => {
  toggleOverlayEdit()
})

// 退出时清理全局快捷键与自带后端进程
// 用 taskkill /F /T 杀整个进程树，确保 .NET 后端及其子进程全部退出、不留僵尸进程
const killProcessTree = (proc: any) => {
  if (proc == null || proc.pid == null) return
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/F', '/T', '/PID', String(proc.pid)], { windowsHide: true })
    } else {
      try { proc.kill('SIGKILL') } catch (e) { /* ignore */ }
    }
  } catch (e) { /* ignore */ }
}

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  killProcessTree(liveServerProc)
  killProcessTree(liveBackend)
})







