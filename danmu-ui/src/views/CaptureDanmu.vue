<template>
    <div id="capture">
        <!-- 顶部拖拽条：拖这里移动窗口；OBS 捕获时可裁剪掉 -->
        <div class="title-bar">
            <span class="dot" :class="signalR.connected() ? 'on' : 'off'"></span>
            <span class="title" :title="streamser.info.roomInfo?.title">{{ streamser.info.roomInfo?.title ||
                'Livedanmu 弹幕窗' }}</span>
            <span class="room" v-if="streamser.info.roomInfo?.roomId">#{{ streamser.info.roomInfo.roomId }}</span>
            <button class="close-btn" title="关闭窗口" @click="closeWindow">✕</button>
        </div>

        <!-- 弹幕区：透明背景，OBS 捕获整个窗口即可 -->
        <div class="danmu-area">
            <Barrage :danmu-count="settings.count" entry-effect-direction="left" :show-avatar="settings.showAvatar"
                :show-medal="settings.showMedal" :settings="settings" />
        </div>

        <!-- OBS 使用提示：设置好后点 ✕ 关闭（会记住） -->
        <div v-if="showTip" class="obs-tip">
            <span>OBS：加「游戏捕获」→ 捕获特定窗口 → 勾选「允许透明」；或「窗口捕获」选 Win10 (1903+) 方式</span>
            <button class="tip-close" title="不再显示" @click="hideTip">✕</button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { reactive, ref, onBeforeMount, onMounted } from 'vue';
import Barrage from '../components/Barrage.vue';
import { useFetch } from '@vueuse/core'
import { useSignalR } from '../stores/signalRStore';
import { AppSetting } from '../utils/appSetting';
import { useStreamer } from '../stores/streamerStore';

const streamser = useStreamer()
const signalR = useSignalR()

// 弹幕设置（与主窗口控制台/屏幕弹幕窗共用同一份 localStorage 数据 + IPC 同步）
const settings = reactive({
    count: 15,
    fontSize: 15,
    lineGap: 8,
    showAvatar: true,
    showMedal: true,
    fontFamily: 'Microsoft YaHei',
    fontColor: '',            // 空 = 跟随舰长/粉丝牌颜色
    strokeWidth: 1,
    strokeColor: '#000000',
    bold: false,
    boxOpacity: 0,
})

// OBS 使用提示：默认显示，手动关闭后记住
const showTip = ref(true)

const closeWindow = () => {
    if (window.electron.closeWindow) window.electron.closeWindow()
}

const hideTip = () => {
    showTip.value = false
    try { localStorage.setItem('obs-capture-tip-dismissed', '1') } catch { }
}

onBeforeMount(() => {
    // 恢复弹幕设置
    try {
        const saved = localStorage.getItem('danmu-settings')
        if (saved) Object.assign(settings, JSON.parse(saved))
    } catch { }
    try {
        if (localStorage.getItem('obs-capture-tip-dismissed')) showTip.value = false
    } catch { }

    // 接收主窗口控制台的设置同步
    if (window.electron.onDanmuSettings) {
        window.electron.onDanmuSettings((s: any) => {
            if (s) Object.assign(settings, s)
            try { localStorage.setItem('danmu-settings', JSON.stringify({ ...settings })) } catch { }
        })
    }

    // 双保险：同源窗口 localStorage 变化（storage 事件即时生效）
    window.addEventListener('storage', (e: StorageEvent) => {
        if (e.key === 'danmu-settings' && e.newValue) {
            try { Object.assign(settings, JSON.parse(e.newValue)) } catch { }
        }
    })

    streamser.info = window.electron.getStreamerInfo() || {}

    signalR.start().then(() => {
        const roomId = streamser.info.roomInfo?.roomId
        if (roomId > 0) {
            useFetch(AppSetting.VITE_API_URL + "/api/barrage/receive")
                .post(JSON.stringify({
                    connectionId: signalR.connectionId(),
                    roomId,
                }), 'application/json').json()
        }
    })
})

onMounted(() => {
    // 固定标题，便于 OBS 捕获下拉列表识别（不会被页面内容覆盖）
    document.title = 'Livedanmu 弹幕窗（OBS 捕获）'
    window.electron.isReady()
})
</script>

<style lang="scss">
html,
body {
    margin: 0;
    padding: 0;
    background: transparent !important;
    overflow: hidden;
}

#capture {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;
    background: transparent;
    font-family: 'Microsoft YaHei', sans-serif;
    user-select: none;
    overflow: hidden;
}

/* 顶部拖拽条：无边框窗口的拖动区域 */
.title-bar {
    height: 34px;
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 10px;
    -webkit-app-region: drag;
    background: rgba(12, 14, 18, 0.55);
    border-radius: 10px 10px 0 0;
    color: #fff;
    font-size: 13px;

    .dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        flex: none;

        &.on {
            background: #3ad17a;
            box-shadow: 0 0 6px #3ad17a;
        }

        &.off {
            background: #ff5b5b;
            box-shadow: 0 0 6px #ff5b5b;
        }
    }

    .title {
        flex: 1;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        text-shadow: 0 0 3px rgba(0, 0, 0, 0.8);
    }

    .room {
        color: #9aa3af;
        font-size: 12px;
        flex: none;
    }

    .close-btn {
        -webkit-app-region: no-drag;
        background: transparent;
        border: none;
        color: rgba(255, 255, 255, 0.75);
        cursor: pointer;
        font-size: 13px;
        line-height: 1;
        padding: 4px 6px;
        border-radius: 5px;

        &:hover {
            background: rgba(255, 255, 255, 0.14);
            color: #fff;
        }
    }
}

.danmu-area {
    flex: 1;
    overflow: hidden;
    background: transparent;
}

/* OBS 使用提示条（会被 OBS 捕获到，设置好后记得关掉） */
.obs-tip {
    position: absolute;
    left: 8px;
    right: 8px;
    bottom: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    background: rgba(12, 14, 18, 0.72);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    color: #ffd166;
    font-size: 12px;
    line-height: 1.4;

    span {
        flex: 1;
    }

    .tip-close {
        flex: none;
        -webkit-app-region: no-drag;
        background: transparent;
        border: none;
        color: rgba(255, 255, 255, 0.7);
        cursor: pointer;
        font-size: 13px;
        padding: 2px 4px;
    }
}
</style>
