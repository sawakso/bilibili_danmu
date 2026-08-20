// eslint-disable-next-line no-undef
const { ipcRenderer, contextBridge } = require('electron')

var gameInfo = {
  handle: 0,
  title: '',
  name: '',
  path: '',
  image: ''
}

var music = {
  title: ''
}

var isForeground = false

ipcRenderer.on('ignoreMouse', (event, bg) => {
  let body = document.getElementsByTagName('body')[0]
  body.style.backgroundColor = bg
})

ipcRenderer.on('DetectGameRunning', (e, info) => {
  const gameContainer = document.getElementById('game-container')
  if (gameContainer != null) {
    if (gameInfo.handle != info.handle) {
      gameInfo = info
      gameContainer.click()
    }
  }
})

ipcRenderer.on('GetMusicInfo', (e, info) => {
  const musicContainer = document.getElementById('music-container')
  if (musicContainer != null) {
    if (music.title !== info.title) {
      music = info
      musicContainer.click()
    }
  }
})

contextBridge.exposeInMainWorld('electron', {
  ignoreMouse: () => {
    ipcRenderer.send('ignoreMouse')
  },
  sendMessageToBackend: (...args) => {
    ipcRenderer.send('backend-server', args)
  },
  getGameInfo: () => {
    return gameInfo
  },
  getMusicInfo: () => {
    return music
  },
  runService: () => {
    ipcRenderer.send('runService')
  },
  getIsforeground: () => {
    return isForeground
  },
  overlay: (info) => {
    ipcRenderer.send('overlay', info)
  },
  // 主窗口 -> Overlay 同步弹幕设置
  sendDanmuSettings: (settings) => {
    ipcRenderer.send('danmu-settings', settings)
  },
  onDanmuSettings: (callback) => {
    ipcRenderer.on('danmu-settings', (event, settings) => callback(settings))
  },
  // 读取当前配置（如鼠标穿透快捷键）
  getConfig: () => {
    return ipcRenderer.invoke('get-config')
  },
  // 请求切换 Overlay"区域调整"模式（等效于按快捷键）
  toggleEditMode: () => {
    ipcRenderer.send('overlay:edit-mode')
  },
  // 设置并即时生效快捷键，返回 { ok, accelerator }
  // key: 'mousePenetration'（默认）或 'overlayEdit'；兼容旧调用 setHotkey(acc)
  setHotkey: (key, acc) => {
    if (acc === undefined) {
      acc = key
      key = 'mousePenetration'
    }
    return ipcRenderer.invoke('set-hotkey', key, acc)
  }
})
