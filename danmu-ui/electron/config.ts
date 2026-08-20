import { app } from 'electron'
import fs from 'fs'
import path from 'path'

// 用户可自定义的配置；目前只有"鼠标穿透"切换快捷键。
// 持久化到 app.getPath('userData')/config.json，跨启动生效。
export const CONFIG_DEFAULTS = {
  // Electron globalShortcut 加速器字符串，Windows 上 CommandOrControl 等价 Ctrl
  mousePenetrationHotkey: 'CommandOrControl+Shift+G',
}

type AppConfig = typeof CONFIG_DEFAULTS

let cache: AppConfig = { ...CONFIG_DEFAULTS }
let loaded = false

function configPath(): string {
  return path.join(app.getPath('userData'), 'config.json')
}

export function loadConfig(): AppConfig {
  if (loaded) return cache
  loaded = true
  try {
    const p = configPath()
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, 'utf-8'))
      cache = { ...CONFIG_DEFAULTS, ...raw }
    }
  } catch (e) {
    // 配置文件损坏时回退到默认，不阻塞启动
    console.warn('[config] 读取失败，使用默认值:', e)
  }
  return cache
}

export function getConfig(): AppConfig {
  return cache
}

export function setConfig(partial: Partial<AppConfig>): AppConfig {
  cache = { ...cache, ...partial }
  try {
    fs.writeFileSync(configPath(), JSON.stringify(cache, null, 2))
  } catch (e) {
    console.warn('[config] 写入失败:', e)
  }
  return cache
}
