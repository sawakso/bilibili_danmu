// eslint-disable-next-line no-undef
const { ipcRenderer, contextBridge } = require('electron')

let isForeground = false
let streamerInfo = {}

ipcRenderer.on('ignoreMouse', () => {
  let styleSetting = document.getElementById('style-seteting')
  styleSetting.click()
})

ipcRenderer.on('receiveStreamerInfo', (e, info) => {
  streamerInfo = info
})

// ----------------------------------------------------------------------------------------------------

ipcRenderer.on('GameIsForeground', (e, info) => {
  const foregroundContainer = document.getElementById('foreground-container')
  if (foregroundContainer != null) {
    isForeground = info.isForeground
    foregroundContainer.click()
  }
})

contextBridge.exposeInMainWorld('electron', {
  isReady: () => {
    ipcRenderer.send('overlay-isReady')
  },
  getIsforeground: () => {
    return isForeground
  },
  getStreamerInfo: () => {
    console.log('raise getStreamerInfo')
    return streamerInfo
  },
  // 控制主窗口是否忽略鼠标事件（用于鼠标穿透）
  setIgnoreMouse: (ignore) => {
    ipcRenderer.send('overlay:set-ignore-mouse', ignore)
  },
  // 接收主窗口控制台同步过来的弹幕设置
  onDanmuSettings: (callback) => {
    ipcRenderer.on('danmu-settings', (event, settings) => callback(settings))
  },
  // 接收"区域调整"模式切换通知（true=进入编辑，false=退出）
  onEditMode: (callback) => {
    ipcRenderer.on('overlay-edit-mode', (event, editing) => callback(editing))
  },
  // 请求主进程切换"区域调整"模式（按钮触发，与快捷键等效）
  toggleEditMode: () => {
    ipcRenderer.send('overlay:edit-mode')
  }
})
