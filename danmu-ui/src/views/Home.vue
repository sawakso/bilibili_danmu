<template>
    <div id="home" class="panel">
        <!-- 顶部：状态 + 房间 + 切换直播间 -->
        <div class="header">
            <span class="dot" :class="signalR.connected() ? 'on' : 'off'"></span>
            <span class="title">{{ streamer.info.roomInfo?.title || '弹幕控制台' }}</span>
            <span class="room" v-if="streamer.info.roomInfo?.roomId">#{{ streamer.info.roomInfo?.roomId }}</span>
            <button class="mini-btn" @click="switchRoom" title="返回登录页重新选择直播间">切换直播间</button>
        </div>

        <!-- OBS 浏览器源叠加：复制链接到 OBS 即显示弹幕，样式自动跟随本控制台 -->
        <div class="section">
            <div class="section-title">OBS 弹幕叠加（浏览器源）</div>
            <div class="row">
                <input type="text" readonly :value="obsUrl" class="text-input obs-url" @click="selectObsUrl" />
                <button class="mini-btn accent" @click="copyObsUrl">{{ copied ? '已复制 ✓' : '复制链接' }}</button>
            </div>
            <div class="row">
                <span class="hint-msg ok">OBS → 来源 → 添加「浏览器源」→ 粘贴链接 → 弹幕透明叠加。调整样式前先点下面按钮切换控制目标。</span>
            </div>
            <div class="row">
                <span class="label">当前控制</span>
                <span class="target-hint">{{ controlTarget === 'obs' ? 'OBS 弹幕（设置已同步到 OBS）' : '屏幕弹幕窗（只影响本机）' }}</span>
                <button class="mini-btn" @click="quickSwitchObs" :disabled="controlTarget === 'obs'">
                    {{ controlTarget === 'obs' ? '已切换 ✓' : '切到 OBS 弹幕' }}
                </button>
                <button class="mini-btn accent" @click="syncNow" title="把当前所有弹幕设置立即推送给 OBS（不管控制目标）">
                    {{ lastSync ? '已同步 ' + lastSync : '立即同步到 OBS' }}
                </button>
            </div>
        </div>

        <!-- 弹幕设置 -->
        <div class="section">
            <div class="section-title">弹幕设置</div>

            <div class="row switch-row target-row">
                <span class="label">控制</span>
                <label class="switch-item" title="调整本机屏幕上的弹幕悬浮窗">
                    <input type="radio" name="ctrlTarget" value="overlay" v-model="controlTarget" @change="switchTarget" />
                    <span>屏幕弹幕窗</span>
                </label>
                <label class="switch-item" title="调整 OBS 浏览器源里的弹幕">
                    <input type="radio" name="ctrlTarget" value="obs" v-model="controlTarget" @change="switchTarget" />
                    <span>OBS 弹幕</span>
                </label>
                <span class="target-hint">{{ controlTarget === 'obs' ? '当前：OBS 弹幕（下面对 OBS 生效）' : '当前：屏幕弹幕窗' }}</span>
            </div>

            <div class="row">
                <span class="label">字号</span>
                <input type="range" min="12" max="30" step="1" v-model.number="settings.fontSize" @input="apply" />
                <span class="val">{{ settings.fontSize }}px</span>
            </div>

            <div class="row">
                <span class="label">行距</span>
                <input type="range" min="0" max="30" step="1" v-model.number="settings.lineGap" @input="apply" />
                <span class="val">{{ settings.lineGap }}px</span>
            </div>

            <div class="row">
                <span class="label">数量</span>
                <input type="range" min="5" max="50" step="1" v-model.number="settings.count" @input="apply" />
                <span class="val">{{ settings.count }}条</span>
            </div>

            <div class="row">
                <span class="label">字体</span>
                <select v-model="settings.fontFamily" @change="apply" class="select">
                    <option value="Microsoft YaHei">微软雅黑</option>
                    <option value="SimHei">黑体</option>
                    <option value="SimSun">宋体</option>
                    <option value="KaiTi">楷体</option>
                    <option value="FangSong">仿宋</option>
                    <option value="Arial">Arial</option>
                </select>
            </div>

            <div class="row">
                <span class="label">颜色</span>
                <div class="palette">
                    <span class="swatch auto" :class="{ active: settings.fontColor === '' }" title="默认(跟随舰长/粉丝牌)"
                        @click="setColor('')">默</span>
                    <span v-for="c in palette" :key="c" class="swatch" :style="{ background: c }"
                        :class="{ active: settings.fontColor === c }" @click="setColor(c)"></span>
                </div>
                <input type="color" v-model="fontColorInput" class="picker" title="自定义颜色" />
                <span class="hex">{{ settings.fontColor || '跟随舰长' }}</span>
            </div>

            <div class="row">
                <span class="label">描边</span>
                <input type="range" min="0" max="4" step="0.5" v-model.number="settings.strokeWidth" @input="apply" />
                <input type="color" v-model="settings.strokeColor" @change="apply" class="picker" />
                <span class="val">{{ settings.strokeWidth }}px</span>
            </div>

            <div class="row">
                <span class="label">加粗</span>
                <label class="switch-item">
                    <input type="checkbox" v-model="settings.bold" @change="apply" />
                    <span>{{ settings.bold ? '开' : '关' }}</span>
                </label>
            </div>

            <div class="row">
                <span class="label">底板</span>
                <input type="range" min="0" max="90" step="5" v-model.number="boxOpacityPercent" @input="apply" />
                <span class="val">{{ boxOpacityPercent }}%</span>
            </div>

            <div class="row switch-row">
                <label class="switch-item">
                    <input type="checkbox" v-model="settings.showAvatar" @change="apply" />
                    <span>头像</span>
                </label>
                <label class="switch-item">
                    <input type="checkbox" v-model="settings.showMedal" @change="apply" />
                    <span>粉丝牌</span>
                </label>
                <label class="switch-item">
                    <input type="checkbox" v-model="settings.showOverlay" @change="apply"
                        title="屏幕上的弹幕悬浮窗；用 OBS 浏览器源时建议关掉，避免重复显示" />
                    <span>屏幕弹幕窗</span>
                </label>
            </div>
        </div>

        <!-- 弹幕过滤 -->
        <div class="section">
            <div class="section-title">弹幕过滤</div>

            <div class="row">
                <span class="label">关键词</span>
                <input type="text" v-model="kwInput" placeholder="回车添加，如：广告" class="text-input"
                    @keydown.enter="addKeyword" />
                <button class="mini-btn" @click="addKeyword">添加</button>
            </div>
            <div class="tags" v-if="settings.blockKeywords.length">
                <span v-for="(k, i) in settings.blockKeywords" :key="k + i" class="tag" title="点击移除"
                    @click="removeKeyword(k)">{{ k }} ✕</span>
            </div>

            <div class="row">
                <span class="label">用户</span>
                <input type="text" v-model="userInput" placeholder="昵称或UID，回车添加" class="text-input"
                    @keydown.enter="addUser" />
                <button class="mini-btn" @click="addUser">添加</button>
            </div>
            <div class="tags" v-if="settings.blockUsers.length">
                <span v-for="(u, i) in settings.blockUsers" :key="u + i" class="tag" title="点击移除"
                    @click="removeUser(u)">{{ u }} ✕</span>
            </div>

            <div class="row" v-if="settings.blockKeywords.length || settings.blockUsers.length">
                <button class="mini-btn danger" @click="clearBlock">清空屏蔽</button>
            </div>
        </div>

        <!-- 快捷键 -->
        <div class="section">
            <div class="section-title">快捷键</div>
            <div class="row">
                <span class="label">鼠标穿透</span>
                <button class="hotkey-box" :class="{ capturing: capturing && hotkeyType === 'mousePenetration' }"
                    @click="startCapture('mousePenetration')" title="点击后按下你想用的按键组合">
                    {{ capturing && hotkeyType === 'mousePenetration' ? '按下按键组合…' : hotkeyText }}
                </button>
                <button class="mini-btn" @click="resetHotkey('mousePenetration')">默认</button>
            </div>
            <div class="row">
                <span class="label">调整弹幕区域</span>
                <button class="hotkey-box" :class="{ capturing: capturing && hotkeyType === 'overlayEdit' }"
                    @click="startCapture('overlayEdit')" title="点击后按下你想用的按键组合">
                    {{ capturing && hotkeyType === 'overlayEdit' ? '按下按键组合…' : overlayEditText }}
                </button>
                <button class="mini-btn" @click="resetHotkey('overlayEdit')">默认</button>
                <button class="mini-btn accent" @click="adjustArea" title="立即进入/退出弹幕区域调整模式">调整区域</button>
            </div>
            <div class="row" v-if="hotkeyMsg">
                <span class="hint-msg" :class="{ ok: hotkeyOk }">{{ hotkeyMsg }}</span>
            </div>
        </div>

        <!-- 操作说明 -->
        <div class="section hint">
            <div class="section-title">操作说明</div>
            <ul>
                <li>快捷键：<b>{{ hotkeyText }}</b> 切换鼠标穿透（可在上方自定义）</li>
                <li>快捷键：<b>{{ overlayEditText }}</b> 进入/退出弹幕区域调整（或点「调整区域」按钮），进入后拖动/缩放弹幕框，调完再按一次保存</li>
                <li>所有设置<b>即时生效</b>并自动保存、同步到置顶弹幕窗</li>
            </ul>
        </div>

        <div class="footer">
            <button class="btn" @click="resetSettings">恢复默认</button>
            <span class="conn" :class="signalR.connected() ? 'ok' : 'bad'">
                {{ signalR.connected() ? '已连接弹幕服务' : '未连接' }}
            </span>
        </div>
    </div>
</template>
<script setup lang="ts">
import { reactive, computed, ref, onBeforeMount, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useSignalR } from '../stores/signalRStore';
import { useStreamer } from '../stores/streamerStore';
import { AppSetting } from '../utils/appSetting';
import { useFetch, useStorage } from '@vueuse/core';

const signalR = useSignalR()
const streamer = useStreamer()
const router = useRouter()

// OBS 浏览器源链接（app 内置 3001 托管弹幕页，房间号自动跟随控制台连接，URL 固定无需改）
const obsUrl = 'http://127.0.0.1:3001/#/obs'
const copied = ref(false)
const copyObsUrl = async () => {
    try {
        await navigator.clipboard.writeText(obsUrl)
        copied.value = true
        setTimeout(() => (copied.value = false), 1500)
    } catch (e) {
        // 老版本/受限环境降级：选中文本让用户手动复制
        const el = document.querySelector('.obs-url') as HTMLInputElement | null
        if (el) { el.select(); el.setSelectionRange(0, 9999) }
    }
}
const selectObsUrl = () => {
    const el = document.querySelector('.obs-url') as HTMLInputElement | null
    if (el) el.select()
}

// 返回登录页重新选择直播间
const switchRoom = () => {
    router.push('/login')
}

const DEFAULT_SETTINGS = {
    count: 15,
    fontSize: 15,
    lineGap: 8,
    showAvatar: true,
    showMedal: true,
    showOverlay: true,        // 屏幕弹幕悬浮窗开关（用 OBS 浏览器源时可关掉）
    fontFamily: 'Microsoft YaHei',
    fontColor: '',
    strokeWidth: 1,
    strokeColor: '#000000',
    bold: false,
    boxOpacity: 0,
    blockKeywords: [] as string[],
    blockUsers: [] as string[],
}

const palette = ['#ffffff', '#ffd700', '#ff5555', '#55ff55', '#55d7ff', '#ff88dd', '#ffaa55']

const settings = reactive({ ...DEFAULT_SETTINGS })

// 底板透明度以百分比显示（0-90）
const boxOpacityPercent = computed({
    get: () => Math.round((settings.boxOpacity ?? 0) * 100),
    set: (v: number) => { settings.boxOpacity = v / 100 },
})

// 控制目标：overlay=本机屏幕弹幕窗 / obs=OBS 浏览器源弹幕；各自独立设置存储
const controlTarget = ref<'overlay' | 'obs'>(
    localStorage.getItem('danmu-control-target') === 'obs' ? 'obs' : 'overlay'
)

const targetKey = () => (controlTarget.value === 'obs' ? 'obs-danmu-settings' : 'danmu-settings')

const load = () => {
    try {
        const saved = localStorage.getItem(targetKey())
        if (saved) Object.assign(settings, JSON.parse(saved))
    } catch { }
}

const persist = () => {
    try { localStorage.setItem(targetKey(), JSON.stringify({ ...settings })) } catch { }
}

// 推送到 OBS（走 HTTP POST 到主进程 3001，绕开 IPC；IPC 保留作双保险）
const pushToObs = async (s: any) => {
    try {
        await fetch('http://127.0.0.1:3001/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(s),
        })
    } catch (e) { /* ignore */ }
}

const apply = () => {
    persist()
    if (controlTarget.value === 'obs') {
        // 同步到 OBS 弹幕页（HTTP POST + IPC 双通道）
        pushToObs({ ...settings })
        if (window.electron.sendObsSettings) window.electron.sendObsSettings({ ...settings })
    } else {
        // 同步到本机屏幕弹幕窗（IPC + storage 事件双通道）
        if (window.electron.sendDanmuSettings) window.electron.sendDanmuSettings({ ...settings })
    }
}

// 切换控制目标：记住选择并加载对应目标的设置
const switchTarget = () => {
    localStorage.setItem('danmu-control-target', controlTarget.value)
    load()
    apply()
}
// OBS 链接区的快捷按钮：一键切到"OBS 弹幕"目标
const quickSwitchObs = () => {
    controlTarget.value = 'obs'
    switchTarget()
}

// 立即同步当前设置到 OBS（不依赖控制目标，显式推送）
const lastSync = ref('')
const syncNow = () => {
    pushToObs({ ...settings })
    try {
        if (window.electron.sendObsSettings) window.electron.sendObsSettings({ ...settings })
    } catch (e) { /* ignore */ }
    const d = new Date()
    lastSync.value = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
    setTimeout(() => (lastSync.value = ''), 5000)
}

const setColor = (c: string) => {
    settings.fontColor = c
    apply()
}

// 取色器永远绑定合法 hex（默认"跟随舰长"时兜底为白色，但不改变 fontColor 值）
const fontColorInput = computed({
    get: () => settings.fontColor || '#ffffff',
    set: (v: string) => {
        settings.fontColor = v
        apply()
    }
})

const resetSettings = () => {
    Object.assign(settings, DEFAULT_SETTINGS)
    apply()
}

// ---- 弹幕过滤 ----
const kwInput = ref('')
const userInput = ref('')

const addKeyword = () => {
    const v = kwInput.value.trim()
    if (v && !settings.blockKeywords.includes(v)) {
        settings.blockKeywords.push(v)
        kwInput.value = ''
        apply()
    }
}

const addUser = () => {
    const v = userInput.value.trim()
    if (v && !settings.blockUsers.includes(v)) {
        settings.blockUsers.push(v)
        userInput.value = ''
        apply()
    }
}

const removeKeyword = (k: string) => {
    settings.blockKeywords = settings.blockKeywords.filter(x => x !== k)
    apply()
}

const removeUser = (u: string) => {
    settings.blockUsers = settings.blockUsers.filter(x => x !== u)
    apply()
}

const clearBlock = () => {
    settings.blockKeywords = []
    settings.blockUsers = []
    apply()
}

// ---- 快捷键（可自定义、持久化、即时生效）：鼠标穿透 / 调整弹幕区域 ----
const hotkey = ref('CommandOrControl+Shift+G')
const overlayEditHotkey = ref('CommandOrControl+Shift+E')
const hotkeyType = ref<'mousePenetration' | 'overlayEdit'>('mousePenetration')
const capturing = ref(false)
const hotkeyMsg = ref('')
const hotkeyOk = ref(false)

// 把 Electron 加速器字符串转成给普通人看的写法（如 Ctrl+Shift+G）
const humanize = (acc: string): string => {
    return (acc || '')
        .replace(/CommandOrControl\+/g, 'Ctrl+')
        .replace(/Command\+/g, 'Win+')
        .replace(/Control\+/g, 'Ctrl+')
        .replace(/Alt\+/g, 'Alt+')
        .replace(/Shift\+/g, 'Shift+')
}

const hotkeyText = computed(() => humanize(hotkey.value))
const overlayEditText = computed(() => humanize(overlayEditHotkey.value))

// 读取主进程保存的快捷键
const fetchHotkey = async () => {
    try {
        const cfg = await window.electron.getConfig()
        if (cfg && cfg.mousePenetrationHotkey) hotkey.value = cfg.mousePenetrationHotkey
        if (cfg && cfg.overlayEditHotkey) overlayEditHotkey.value = cfg.overlayEditHotkey
    } catch (e) { /* 老版本无此接口时忽略 */ }
}

const startCapture = (type: 'mousePenetration' | 'overlayEdit' = 'mousePenetration') => {
    if (capturing.value) return
    hotkeyType.value = type
    capturing.value = true
    hotkeyMsg.value = ''
    hotkeyOk.value = false
    // 捕获下一次按键组合（捕获阶段，确保优先于页面内其它监听）
    window.addEventListener('keydown', onCaptureKey, true)
}

const mapKey = (e: KeyboardEvent): string | null => {
    const k = e.key
    if (k === ' ' || e.code === 'Space') return 'Space'
    if (/^F([1-9]|1[0-2]|2[0-4])$/.test(k)) return k // F1~F24
    const arrows: Record<string, string> = { ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right' }
    if (arrows[k]) return arrows[k]
    const named: Record<string, string> = {
        Enter: 'Enter', Tab: 'Tab', Escape: 'Esc', Backspace: 'Backspace',
        Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End',
        PageUp: 'PageUp', PageDown: 'PageDown',
    }
    if (named[k]) return named[k]
    if (k.length === 1) return k.toUpperCase() // 字母/数字/符号
    return null
}

const onCaptureKey = (e: KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // 单独按修饰键不算，等真正的主键
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return
    const parts: string[] = []
    if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl')
    if (e.shiftKey) parts.push('Shift')
    if (e.altKey) parts.push('Alt')
    const main = mapKey(e)
    if (!main) {
        hotkeyMsg.value = '该按键暂不支持，请换一个组合键'
        hotkeyOk.value = false
        endCapture()
        return
    }
    parts.push(main)
    const acc = parts.join('+')
    endCapture()
    applyHotkey(acc, hotkeyType.value)
}

const endCapture = () => {
    capturing.value = false
    window.removeEventListener('keydown', onCaptureKey, true)
}

const applyHotkey = async (acc: string, type: 'mousePenetration' | 'overlayEdit' = 'mousePenetration') => {
    try {
        const res = await window.electron.setHotkey(type, acc)
        if (res && res.ok) {
            if (type === 'overlayEdit') overlayEditHotkey.value = res.accelerator || acc
            else hotkey.value = res.accelerator || acc
            hotkeyMsg.value = '已保存，全局快捷键即时生效'
            hotkeyOk.value = true
        } else {
            hotkeyMsg.value = '注册失败：该组合可能已被系统或其它软件占用'
            hotkeyOk.value = false
        }
    } catch (e) {
        hotkeyMsg.value = '保存失败（请升级到最新版本）'
        hotkeyOk.value = false
    }
}

const resetHotkey = (type: 'mousePenetration' | 'overlayEdit' = 'mousePenetration') =>
    applyHotkey(type === 'overlayEdit' ? 'CommandOrControl+Shift+E' : 'CommandOrControl+Shift+G', type)

// 立即进入/退出弹幕区域调整模式（等效于按快捷键）
const adjustArea = () => {
    if (window.electron.toggleEditMode) window.electron.toggleEditMode()
}

const connectRoom = () => {
    if (streamer.info.roomInfo?.roomId > 0) {
        useFetch(AppSetting.VITE_API_URL + "/api/barrage/receive").post(JSON.stringify({
            connectionId: signalR.connectionId(),
            roomId: streamer.info.roomInfo.roomId
        }), 'application/json').json()
        console.log('join room :' + streamer.info.roomInfo?.roomId);
        // 同步房间号给主进程，OBS 浏览器源弹幕页可自动跟随连接
        if (window.electron.setRoomId) window.electron.setRoomId(streamer.info.roomInfo.roomId)
    }
}

onBeforeMount(() => {
    load()
    signalR.start().then(() => {
        connectRoom()
    })
})

onMounted(() => {
    // 独立窗口标题，便于 OBS 窗口捕获识别
    document.title = 'Livedanmu 控制台'
    useStorage('streamer', streamer.info)
    try {
        window.electron.runService()
        // 屏幕弹幕窗开关：用 OBS 浏览器源时可关闭，避免重复显示/被显示器采集拍到
        if (settings.showOverlay) {
            window.electron.overlay(JSON.parse(JSON.stringify(streamer.info)))
        }
    } catch (error) {
        console.log(error);
    }
    // 读取已保存的鼠标穿透快捷键，没有则保持默认
    fetchHotkey()
    // 诊断上报：window.electron 接口可见性（排查 OBS 设置不同步）
    try {
        if (window.electron.diag) {
            window.electron.diag({
                has: typeof window.electron.sendObsSettings,
                keys: Object.keys(window.electron),
                target: controlTarget.value,
                url: window.location.href,
            })
        }
    } catch (e) { /* ignore */ }
    // Overlay 打开后把当前设置同步过去
    setTimeout(() => apply(), 1200)
    // 连接后自动隐藏控制台到托盘（点托盘图标恢复），避免被 OBS 显示器采集拍到
    if (window.electron.hideWindow) {
        setTimeout(() => window.electron.hideWindow(), 8000)
    }
})
</script>

<style lang="scss" scoped>
.panel {
    position: relative;
    height: 100%;
    box-sizing: border-box;
    padding: 16px;
    background:
        radial-gradient(120% 60% at 85% -10%, rgba(102, 126, 234, 0.20), transparent 55%),
        radial-gradient(100% 50% at -10% 110%, rgba(118, 75, 162, 0.16), transparent 55%),
        linear-gradient(168deg, #151731 0%, #0f1124 55%, #0b0c1a 100%);
    color: #e6e8f2;
    display: flex;
    flex-direction: column;
    gap: 12px;
    user-select: none;
    overflow-y: auto;
    overflow-x: hidden;

    &::before,
    &::after {
        content: '';
        position: fixed;
        border-radius: 50%;
        filter: blur(70px);
        pointer-events: none;
        z-index: 0;
    }
    &::before {
        width: 180px;
        height: 180px;
        background: rgba(102, 126, 234, 0.10);
        top: -60px;
        right: -50px;
    }
    &::after {
        width: 150px;
        height: 150px;
        background: rgba(58, 209, 122, 0.06);
        bottom: -50px;
        left: -50px;
    }

    &::-webkit-scrollbar {
        width: 6px;
    }
    &::-webkit-scrollbar-thumb {
        background: rgba(140, 155, 255, 0.25);
        border-radius: 3px;
    }
    &::-webkit-scrollbar-track {
        background: transparent;
    }
}

.header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(140, 155, 255, 0.12);
    flex: none;

    .dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        flex: none;

        &.on {
            background: #3ad17a;
            box-shadow: 0 0 10px #3ad17a, 0 0 20px rgba(58, 209, 122, 0.4);
        }

        &.off {
            background: #ff5b5b;
            box-shadow: 0 0 10px #ff5b5b;
        }
    }

    .title {
        flex: 1;
        font-size: 14px;
        font-weight: 700;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        background: linear-gradient(90deg, #a8b8ff, #7b8cff 55%, #9d8bff);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        letter-spacing: 0.3px;
    }

    .room {
        font-size: 12px;
        color: #8b93b8;
        background: rgba(102, 126, 234, 0.14);
        border: 1px solid rgba(140, 155, 255, 0.2);
        padding: 1px 7px;
        border-radius: 10px;
    }
}

.section {
    position: relative;
    background: rgba(110, 130, 245, 0.05);
    border: 1px solid rgba(140, 155, 255, 0.12);
    border-radius: 16px;
    padding: 13px 14px;
    flex: none;
    box-shadow: 0 4px 22px rgba(0, 0, 0, 0.2);
    transition: border-color 0.18s ease, box-shadow 0.18s ease;

    &:hover {
        border-color: rgba(140, 155, 255, 0.24);
        box-shadow: 0 6px 26px rgba(0, 0, 0, 0.22);
    }

    .section-title {
        font-size: 12.5px;
        font-weight: 600;
        color: #9fb0ff;
        margin-bottom: 10px;
        letter-spacing: 1.2px;
        display: flex;
        align-items: center;
        gap: 7px;

        &::before {
            content: '';
            width: 3px;
            height: 13px;
            border-radius: 2px;
            background: linear-gradient(180deg, #8fa4ff, #667eea);
            box-shadow: 0 0 8px rgba(102, 126, 234, 0.55);
            flex: none;
        }
    }
}

.row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;

    &:last-child {
        margin-bottom: 0;
    }

    .label {
        width: 44px;
        font-size: 13px;
        color: #c3c9e2;
        flex: none;
    }

    input[type="range"] {
        flex: 1;
        accent-color: #8fa4ff;
        min-width: 0;
    }

    .val {
        width: 52px;
        text-align: right;
        font-size: 12px;
        color: #8b93b8;
        flex: none;
        font-variant-numeric: tabular-nums;
    }

    .select {
        flex: 1;
        background: rgba(255, 255, 255, 0.05);
        color: #e6e8f2;
        border: 1px solid rgba(140, 155, 255, 0.16);
        border-radius: 8px;
        padding: 4px 8px;
        font-size: 13px;
        outline: none;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;

        &:focus {
            border-color: rgba(140, 155, 255, 0.5);
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.18);
        }

        option {
            background: #12142a;
        }
    }

    .text-input {
        flex: 1;
        min-width: 0;
        background: rgba(255, 255, 255, 0.05);
        color: #e6e8f2;
        border: 1px solid rgba(140, 155, 255, 0.16);
        border-radius: 8px;
        padding: 4px 9px;
        font-size: 13px;
        outline: none;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;

        &:focus {
            border-color: rgba(140, 155, 255, 0.5);
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.18);
        }
    }

    .obs-url {
        flex: none;
        width: 235px;
        font-family: Consolas, 'Courier New', monospace;
        font-size: 12px;
        letter-spacing: 0.3px;
        cursor: text;
    }

    .mini-btn {
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(140, 155, 255, 0.16);
        color: #d9def2;
        border-radius: 8px;
        padding: 4px 11px;
        font-size: 12px;
        cursor: pointer;
        flex: none;
        transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;

        &:hover {
            background: rgba(255, 255, 255, 0.12);
            border-color: rgba(140, 155, 255, 0.34);
        }

        &:disabled {
            opacity: 0.55;
            cursor: default;
        }

        &.accent {
            color: #fff;
            background: linear-gradient(135deg, #667eea, #764ba2);
            border-color: transparent;
            box-shadow: 0 2px 12px rgba(102, 126, 234, 0.35);

            &:hover {
                box-shadow: 0 4px 18px rgba(102, 126, 234, 0.5);
                filter: brightness(1.08);
                background: linear-gradient(135deg, #667eea, #764ba2);
            }
        }

        &.danger {
            border-color: rgba(255, 91, 91, 0.45);
            color: #ff8080;

            &:hover {
                background: rgba(255, 91, 91, 0.14);
            }
        }
    }

    .tags {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 10px;

        .tag {
            background: rgba(255, 91, 91, 0.13);
            border: 1px solid rgba(255, 91, 91, 0.32);
            color: #ffb8b8;
            border-radius: 12px;
            padding: 2px 9px;
            font-size: 12px;
            cursor: pointer;
            transition: background 0.15s ease;

            &:hover {
                background: rgba(255, 91, 91, 0.26);
            }
        }
    }
}

.palette {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    flex-wrap: nowrap;

    .swatch {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 2px solid rgba(255, 255, 255, 0.15);
        cursor: pointer;
        flex: none;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        transition: transform 0.12s ease, box-shadow 0.12s ease;

        &:hover {
            transform: scale(1.12);
        }

        &.auto {
            background: linear-gradient(135deg, #888 50%, #444 50%);
            color: #fff;
        }

        &.active {
            border-color: #8fa4ff;
            box-shadow: 0 0 8px rgba(143, 164, 255, 0.7);
        }
    }

    .picker {
        width: 24px;
        height: 24px;
        border: none;
        border-radius: 50%;
        padding: 0;
        background: transparent;
        cursor: pointer;
        flex: none;
    }

    .hex {
        font-size: 11px;
        color: #8b93b8;
        flex: none;
        max-width: 76px;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
    }
}

.switch-row {
    gap: 20px;

    .switch-item {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        color: #c3c9e2;
        cursor: pointer;
        transition: color 0.15s ease;

        &:hover {
            color: #e6e8f2;
        }

        input {
            accent-color: #8fa4ff;
        }
    }
}

.target-row {
    background: rgba(102, 126, 234, 0.08);
    border: 1px solid rgba(140, 155, 255, 0.2);
    border-radius: 10px;
    padding: 6px 9px;
    gap: 12px;

    .target-hint {
        flex: 1;
        text-align: right;
        font-size: 12px;
        color: #9fb0ff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
}

.hint {
    flex: 1;

    ul {
        margin: 0;
        padding-left: 16px;
        font-size: 12px;
        color: #8b93b8;
        line-height: 1.9;

        b {
            color: #c3c9e2;
        }
    }
}

.footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex: none;
    padding-top: 2px;

    .btn {
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(140, 155, 255, 0.16);
        color: #d9def2;
        border-radius: 8px;
        padding: 5px 13px;
        font-size: 12px;
        cursor: pointer;
        transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;

        &:hover {
            background: rgba(255, 255, 255, 0.12);
            border-color: rgba(140, 155, 255, 0.34);
            box-shadow: 0 2px 10px rgba(102, 126, 234, 0.25);
        }
    }

    .conn {
        font-size: 12px;

        &.ok {
            color: #3ad17a;
        }

        &.bad {
            color: #ff6b6b;
        }
    }
}

.hotkey-box {
    flex: 1;
    min-width: 0;
    background: rgba(255, 255, 255, 0.05);
    color: #e6e8f2;
    border: 1px solid rgba(140, 155, 255, 0.16);
    border-radius: 8px;
    padding: 5px 10px;
    font-size: 13px;
    cursor: pointer;
    text-align: left;
    outline: none;
    transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;

    &:hover {
        background: rgba(255, 255, 255, 0.11);
        border-color: rgba(140, 155, 255, 0.34);
    }

    &.capturing {
        border-color: #8fa4ff;
        color: #a8b8ff;
        box-shadow: 0 0 10px rgba(143, 164, 255, 0.4);
    }
}

.hint-msg {
    font-size: 12px;
    color: #ff8080;

    &.ok {
        color: #3ad17a;
    }
}
</style>
