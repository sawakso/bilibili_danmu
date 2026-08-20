import { BrowserWindow } from "electron";
import path from "path";
import { overlayWindowUrl, isProduction, distDir } from '../consts'


let overlayWindow: BrowserWindow;
const createOverlayWindow = (callback: () => void) => {

    overlayWindow = new BrowserWindow({
        show: true,
        transparent: true,
        fullscreen: true,
        frame: false,
        resizable: false,
        skipTaskbar: true,
        webPreferences: {
            contextIsolation: true, // 是否开启隔离上下文
            nodeIntegration: true, // 渲染进程使用Node API
            preload: path.join(__dirname, "../electron/overlay-preload.js"), // 需要引用js文件
        },
    });

    overlayWindow.setIgnoreMouseEvents(true, { forward: true })
    overlayWindow.setAlwaysOnTop(true, 'pop-up-menu')

    // 打包后从本地 dist 加载 Overlay 路由（hash 模式 -> #/overlay）；开发期走 Vite dev server
    const loadOverlay = isProduction
        ? overlayWindow.loadFile(path.join(distDir, 'index.html'), { hash: '/overlay' })
        : overlayWindow.loadURL(overlayWindowUrl)

    loadOverlay.then(() => {
        callback()
    });
}


export { createOverlayWindow, overlayWindow }
