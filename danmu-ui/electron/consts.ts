import { app } from "electron";
import path from "path";

const appName = 'overlay'

const gotTheLock = app.requestSingleInstanceLock()

const isDevelopment = !app.isPackaged;
const isProduction = app.isPackaged;
const windowsIsTrueMacIsFalse = process.platform == 'win32'

// 开发期走 Vite dev server（路由是 hash 模式，Overlay 深链必须带 #/overlay）；打包后由 background.ts / overlayWindow.ts 用本地 dist 加载（file://），不再依赖远程服务器
const mainWindowUrl = 'http://localhost:3000'
const overlayWindowUrl = 'http://localhost:3000/#/overlay'

// 打包后 UI 走本地 file:// 加载（不再依赖远程服务器），dist 目录与编译后的 background.js 同级（dist-electron/../dist）
const distDir = path.join(__dirname, '../dist')




export {
    appName,
    gotTheLock,
    windowsIsTrueMacIsFalse,
    isDevelopment,
    isProduction,
    mainWindowUrl,
    overlayWindowUrl,
    distDir
}