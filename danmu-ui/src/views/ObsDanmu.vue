<template>
    <div id="obs">
        <!-- 设置条（OBS 里可裁剪掉或点隐藏） -->
        <div v-if="showSettings" class="settings">
            <div class="row">
                <span class="label">房间号</span>
                <input v-model.number="roomIdInput" type="number" class="input" placeholder="如 571631"
                    @keyup.enter="connect" />
                <button class="btn primary" @click="connect" :disabled="connecting">
                    {{ connecting ? '连接中…' : '连接' }}</button>
                <span class="status" :class="signalR.connected() ? 'ok' : 'bad'">
                    {{ signalR.connected() ? '已连接' : '未连接' }}</span>
            </div>
            <div class="row">
                <span class="label">字号</span>
                <input type="range" min="12" max="36" step="1" v-model.number="settings.fontSize" @input="persist" />
                <span class="val">{{ settings.fontSize }}</span>
                <span class="label">行距</span>
                <input type="range" min="0" max="30" step="1" v-model.number="settings.lineGap" @input="persist" />
                <span class="val">{{ settings.lineGap }}</span>
                <span class="label">数量</span>
                <input type="range" min="5" max="30" step="1" v-model.number="settings.count" @input="persist" />
                <span class="val">{{ settings.count }}</span>
            </div>
            <div class="row">
                <span class="label">颜色</span>
                <input type="color" v-model="fontColorInput" class="picker" title="弹幕颜色（默认跟随舰长）" />
                <span class="label">描边</span>
                <input type="range" min="0" max="3" step="0.5" v-model.number="settings.strokeWidth" @input="persist" />
                <span class="val">{{ settings.strokeWidth }}</span>
                <label class="chk"><input type="checkbox" v-model="settings.showAvatar" @change="persist" />头像</label>
                <label class="chk"><input type="checkbox" v-model="settings.showMedal" @change="persist" />粉丝牌</label>
                <button class="btn" @click="showSettings = false" title="隐藏设置条，只剩弹幕（刷新页面可恢复）">隐藏设置</button>
            </div>
        </div>
        <div v-else class="gear" title="显示设置" @click="showSettings = true">⚙</div>

        <!-- 弹幕区：透明背景，OBS 浏览器源里裁剪/缩放只保留这里 -->
        <div class="danmu-zone">
            <Barrage :danmu-count="settings.count" entry-effect-direction="left" :show-avatar="settings.showAvatar"
                :show-medal="settings.showMedal" :settings="settings" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed } from 'vue';
import Barrage from '../components/Barrage.vue';
import { useSignalR } from '../stores/signalRStore';
import { useFetch } from '@vueuse/core';
import { AppSetting } from '../utils/appSetting';

const signalR = useSignalR()

// 弹幕设置（OBS 页面独立的 localStorage，不影响主程序）
const settings = reactive({
    count: 15,
    fontSize: 18,
    lineGap: 6,
    showAvatar: false,
    showMedal: true,
    fontFamily: 'Microsoft YaHei',
    fontColor: '',            // 空 = 跟随舰长/粉丝牌颜色
    strokeWidth: 1,
    strokeColor: '#000000',
    bold: false,
    boxOpacity: 0,
})
const load = () => { try { const s = localStorage.getItem('obs-danmu-settings'); if (s) Object.assign(settings, JSON.parse(s)) } catch { } }
const persist = () => { try { localStorage.setItem('obs-danmu-settings', JSON.stringify({ ...settings })) } catch { } }

const showSettings = ref(true)
const roomIdInput = ref(0)
const connecting = ref(false)

// 取色器显示修正
const fontColorInput = computed({
    get: () => settings.fontColor || '#ffffff',
    set: (v: string) => { settings.fontColor = v; persist() },
})

// 房间号优先级：URL ?roomId= > app 同步的 /api/state > localStorage 记忆
const q = new URLSearchParams(window.location.hash.split('?')[1] || '')
const qRoom = Number(q.get('roomId'))
const savedRoom = Number(localStorage.getItem('obs-room'))
roomIdInput.value = qRoom || 0

// 打包后由 app 在 3001 端口托管本页，同源 /api/state 直接返回当前房间号（自动跟随主窗口）
const autoFetchRoom = async () => {
    if (roomIdInput.value > 0) return
    try {
        const res = await fetch('/api/state')
        if (res.ok) {
            const data = await res.json()
            if (data && data.roomId) roomIdInput.value = Number(data.roomId)
        }
    } catch (e) { /* dev/独立打开时无此接口，忽略 */ }
    if (roomIdInput.value <= 0) roomIdInput.value = savedRoom
}

const connect = async () => {
    const roomId = Number(roomIdInput.value)
    if (!roomId || roomId <= 0) return
    localStorage.setItem('obs-room', String(roomId))
    connecting.value = true
    try {
        if (!signalR.connected()) await signalR.start()
        await useFetch(AppSetting.VITE_API_URL + '/api/barrage/receive')
            .post(JSON.stringify({
                connectionId: signalR.connectionId(),
                roomId,
            }), 'application/json').json()
    } catch (e) {
        console.error('[obs] 连接弹幕服务失败', e)
    } finally {
        connecting.value = false
    }
}

load()
// 拿到房间号则自动连接
autoFetchRoom().then(() => {
    if (roomIdInput.value > 0) connect()
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

#obs {
    position: relative;
    width: 100vw;
    height: 100vh;
    background: transparent;
    font-family: 'Microsoft YaHei', sans-serif;
    user-select: none;
}

.settings {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 10;
    background: rgba(18, 20, 24, 0.82);
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    padding: 8px 12px;
    color: #e8eaed;
    font-size: 12px;

    .row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;

        &:last-child {
            margin-bottom: 0;
        }
    }

    .label {
        color: #9aa3af;
        flex: none;
    }

    .input {
        width: 110px;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 6px;
        color: #e8eaed;
        padding: 3px 8px;
    }

    input[type="range"] {
        width: 90px;
        accent-color: #3ad17a;
    }

    .val {
        width: 24px;
        color: #9aa3af;
        flex: none;
    }

    .picker {
        width: 24px;
        height: 24px;
        border: none;
        border-radius: 50%;
        padding: 0;
        background: transparent;
        cursor: pointer;
    }

    .chk {
        display: flex;
        align-items: center;
        gap: 4px;
        color: #c6ccd4;
        cursor: pointer;

        input {
            accent-color: #3ad17a;
        }
    }

    .btn {
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #e8eaed;
        border-radius: 6px;
        padding: 4px 10px;
        font-size: 12px;
        cursor: pointer;

        &.primary {
            background: #3ad17a;
            border-color: #3ad17a;
            color: #0b1a12;
            font-weight: 500;

            &:disabled {
                opacity: 0.6;
                cursor: default;
            }
        }
    }

    .status {
        &.ok {
            color: #3ad17a;
        }

        &.bad {
            color: #ff5b5b;
        }
    }
}

.gear {
    position: absolute;
    top: 6px;
    right: 8px;
    z-index: 10;
    font-size: 18px;
    cursor: pointer;
    color: rgba(255, 255, 255, 0.85);
    background: rgba(0, 0, 0, 0.4);
    border-radius: 50%;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.danmu-zone {
    position: absolute;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
}
</style>
