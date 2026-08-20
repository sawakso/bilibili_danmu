<template>
    <div id="overlay">
        <!-- 弹幕盒：正常模式鼠标穿透；"区域调整"模式下可拖拽/缩放 -->
        <v-d-r class="danmu-box" :class="{ 'box-active': !clickThrough || editMode, 'edit-mode': editMode }"
            :style="boxStyle" :w="box.w" :h="box.h" :x="box.x" :y="box.y" :resizable="editMode" :parent="true"
            :draggable="editMode" @drag-end="onDragEnd" @resize-end="onResizeEnd" @mouseenter="onEnter"
            @mouseleave="onLeave">

            <div class="title-bar" @mousedown="onEnter">
                <span class="dot" :class="signalR.connected() ? 'on' : 'off'"></span>
                <span class="title" :title="streamser.info.roomInfo?.title">{{ streamser.info.roomInfo?.title || '弹幕姬'
                    }}</span>
                <button v-if="editMode" class="lock-btn done" title="完成调整并恢复鼠标穿透" @click.stop="finishEdit">完成</button>
                <button v-else class="lock-btn" :title="clickThrough ? '已锁定(鼠标穿透)，点击解锁可拖动' : '已解锁，点击锁定为鼠标穿透'"
                    @click.stop="toggleLock">{{ clickThrough ? '🔒' : '🔓' }}</button>
            </div>

            <div v-if="editMode" class="edit-tip">调整模式：拖动/缩放弹幕框，完成后按快捷键或点「完成」</div>

            <div v-if="statusMsg" class="status-msg">{{ statusMsg }}</div>

            <div class="danmu-area">
                <Barrage :danmu-count="settings.count" entry-effect-direction="left" :show-avatar="settings.showAvatar"
                    :show-medal="settings.showMedal" :settings="settings" />
            </div>
        </v-d-r>
    </div>
</template>
<script setup lang="ts">
import { ref, reactive, computed, onBeforeMount, onMounted, watch } from 'vue';
import Barrage from '../components/Barrage.vue';
import { useFetch } from '@vueuse/core'
import { useSignalR } from '../stores/signalRStore';
import { AppSetting } from '../utils/appSetting';
import { useStreamer } from '../stores/streamerStore';

const streamser = useStreamer()
const signalR = useSignalR()

const box = reactive({ w: 400, h: 640, x: 20, y: 80 })

// 弹幕设置（与主窗口控制台同步，localStorage 持久化）
const settings = reactive({
    count: 15,
    fontSize: 15,
    lineGap: 8,
    showAvatar: true,
    showMedal: true,
    fontFamily: 'Microsoft YaHei',
    fontColor: '',            // 空 = 跟随舰长/粉丝牌颜色
    strokeWidth: 1,           // 描边粗细 px
    strokeColor: '#000000',
    bold: false,
    boxOpacity: 0,            // 弹幕盒背景透明度 0=透明
})

// 弹幕盒背景（boxOpacity > 0 时显示半透明底板）
const boxStyle = computed(() => {
    const o = settings.boxOpacity ?? 0
    return {
        background: o > 0 ? `rgba(18, 20, 24, ${o})` : 'transparent',
        border: o > 0 ? '1px solid rgba(255, 255, 255, 0.15)' : 'none',
    }
})

// 默认：鼠标穿透（类似弹幕姬，不挡游戏/桌面操作）
const clickThrough = ref(true)
const hovering = ref(false)

// "区域调整"模式：快捷键/主窗口按钮进入后，解除穿透、弹幕框可拖拽缩放
const editMode = ref(false)

// 连接状态提示
const statusMsg = computed(() => {
    if (!signalR.connected()) return '未连接弹幕服务（请确认后端 LiveServer 已启动且房间正在直播）'
    return ''
})

// 计算当前是否应忽略鼠标：调整模式 或 穿透模式且未悬停 -> 忽略；其余 -> 捕获（可拖动/点击）
const applyIgnoreMouse = () => {
    const ignore = editMode.value ? false : (clickThrough.value && !hovering.value)
    window.electron.setIgnoreMouse(ignore)
}

const onEnter = () => { hovering.value = true; applyIgnoreMouse() }
const onLeave = () => { hovering.value = false; applyIgnoreMouse() }
const toggleLock = () => { clickThrough.value = !clickThrough.value; applyIgnoreMouse() }
// 点"完成"退出调整模式（等效于再次按快捷键）
const finishEdit = () => { window.electron.toggleEditMode() }

const persist = () => {
    try { localStorage.setItem('danmu-box', JSON.stringify({ ...box })) } catch { }
}
const onDragEnd = (e: any) => { if (e) { box.x = e.x; box.y = e.y } persist() }
const onResizeEnd = (e: any) => { if (e) { box.x = e.x; box.y = e.y; box.w = e.w; box.h = e.h } persist() }

onBeforeMount(() => {
    // 恢复上次拖动的位置/尺寸
    try {
        const saved = localStorage.getItem('danmu-box')
        if (saved) Object.assign(box, JSON.parse(saved))
    } catch { }

    // 恢复弹幕设置（与主窗口共用同一份 localStorage 数据格式）
    try {
        const saved = localStorage.getItem('danmu-settings')
        if (saved) Object.assign(settings, JSON.parse(saved))
    } catch { }

    // 接收主窗口控制台的设置同步
    if (window.electron.onDanmuSettings) {
        window.electron.onDanmuSettings((s: any) => {
            if (s) Object.assign(settings, s)
            try { localStorage.setItem('danmu-settings', JSON.stringify({ ...settings })) } catch { }
        })
    }

    // 接收"区域调整"模式切换：进入后解除穿透可拖拽，退出后恢复穿透
    if (window.electron.onEditMode) {
        window.electron.onEditMode((editing: boolean) => {
            editMode.value = !!editing
            if (editing) hovering.value = true
            applyIgnoreMouse()
        })
    }

    // 双保险：同源窗口 localStorage 变化会触发 storage 事件（即时生效，无需重启）
    window.addEventListener('storage', (e: StorageEvent) => {
        if (e.key === 'danmu-settings' && e.newValue) {
            try { Object.assign(settings, JSON.parse(e.newValue)) } catch { }
        }
    })

    streamser.info = window.electron.getStreamerInfo()

    signalR.start().then(() => {
        useFetch(AppSetting.VITE_API_URL + "/api/barrage/receive")
            .post(JSON.stringify({
                connectionId: signalR.connectionId(),
                roomId: streamser.info.roomInfo.roomId
            }), 'application/json').json()
    })

    applyIgnoreMouse()
})

onMounted(() => {
    window.electron.isReady()
    watch(() => signalR.connected(), () => applyIgnoreMouse())
})

</script>

<style lang="scss">
#overlay {
    position: absolute;
    height: 100%;
    width: 100%;
    background-color: transparent;
    user-select: none;
}

.danmu-box {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background-color: transparent;
    border-radius: 8px;

    &.box-active {
        background-color: rgba(18, 20, 24, 0.55);
        border: 1px solid rgba(255, 255, 255, 0.18);
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.4);
    }

    &.edit-mode {
        border: 2px dashed #3ad17a;
        box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.25);
    }

    .edit-tip {
        color: #3ad17a;
        font-size: 12px;
        padding: 6px 10px;
        background: rgba(0, 0, 0, 0.65);
        text-shadow: 0 0 3px rgba(0, 0, 0, 0.8);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .title-bar {
        height: 30px;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 10px;
        cursor: move;
        background: rgba(0, 0, 0, 0.45);
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

        .lock-btn {
            background: transparent;
            border: none;
            color: #fff;
            cursor: pointer;
            font-size: 14px;
            line-height: 1;
            padding: 2px 4px;

            &.done {
                color: #3ad17a;
                border: 1px solid rgba(58, 209, 122, 0.6);
                border-radius: 4px;
                font-size: 13px;
                padding: 3px 8px;
            }
        }
    }

    .status-msg {
        color: #ffd166;
        font-size: 12px;
        padding: 6px 10px;
        background: rgba(0, 0, 0, 0.5);
        text-shadow: 0 0 3px rgba(0, 0, 0, 0.8);
    }

    .danmu-area {
        flex: 1;
        overflow: hidden;
    }
}
</style>
