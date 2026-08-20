<template>
    <div id="danmu" :style="rootStyle">

        <div class="danmu">


            <div class="header">
                <div class="interactWord" v-if="signalR.data.interactWord != null">{{
                    signalR.data.interactWord.userName }}
                </div>
            </div>

            <div class="rows">
                <transition-group appear tag="ul" name="danmu">
                    <template v-for="item in visibleComments" :key="item.key">
                        <div :class="{ 'message': true }">
                            <div class="avatar-medal-name ">

                                <el-avatar :size="Math.max(20, Math.round(fontSize * 1.9))" v-if="showAvatar2"
                                    :src="item.faceUrl ?? 'http://i0.hdslb.com/bfs/face/member/noface.jpg'"></el-avatar>
                                <div style="color:red;border: 1px solid red; border-radius: 12%;" v-if="item.isAdmin">
                                    <span class="admin">房</span>
                                </div>
                                <div v-if="item.top3 > 0"
                                    style="font-size: 8px;border: 1px solid #ff5283 ;border-radius:12%; background-color: #ff5283;">
                                    <span>榜单 {{ item.top3 }}</span>
                                </div>
                                <template v-if="item.hasMedal && showMedal2">
                                    <div class="medal">
                                        <span class="medal-name">{{ item.medalName }}</span>
                                        <span class="medal-lvl"> {{ item.medalLevel }}</span>
                                    </div>
                                </template>
                                <div class="name">{{ item.userName }}</div>
                            </div>

                            <div v-html="item.comment" class="comment" :style="textStyle(item)" />
                        </div>
                    </template>
                </transition-group>
            </div>
        </div>


        <div class="entryEffect">
            <transition-group appear tag="ul" name="entry">
                <template v-for="item in signalR.data.entryEffects" :key="item.key">
                    <EntryEffect :face="item.face" :backgroundUrl="item.baseImageUrl" :msg="item.message" />
                </template>
            </transition-group>
        </div>


    </div>
</template>
<script setup lang="ts">
import { computed, onBeforeMount, ref, watch } from 'vue'
import EntryEffect from './EntryEffect.vue'
import { useSignalR } from '../stores/signalRStore';


const signalR = useSignalR()

const props = defineProps<{
    danmuCount: number,
    entryEffectDirection: string,
    showAvatar: boolean,
    showMedal: boolean,
    // 完整设置对象（控制台传入；缺省时用上面的 props）
    settings?: any
}>()

// 设置（settings 优先，兜底 props）
const s = computed(() => props.settings || {})
const fontSize = computed(() => s.value.fontSize ?? 15)
const showAvatar2 = computed(() => s.value.showAvatar ?? props.showAvatar)
const showMedal2 = computed(() => s.value.showMedal ?? props.showMedal)
const danmuCount = computed(() => s.value.count ?? props.danmuCount)

// 通过 CSS 变量统一应用弹幕样式（即时生效）
const rootStyle = computed(() => ({
    '--dm-font-size': fontSize.value + 'px',
    '--dm-line-gap': (s.value.lineGap ?? 8) + 'px',
    '--dm-font-family': s.value.fontFamily || "'Microsoft YaHei', sans-serif",
    '--dm-stroke-width': (s.value.strokeWidth ?? 0) + 'px',
    '--dm-stroke-color': s.value.strokeColor || '#000000',
    '--dm-font-weight': s.value.bold ? 700 : 400,
}))

// 弹幕样式：颜色 + text-shadow 多方向描边（经典弹幕姬做法，效果最清晰）
// strokeWidth: 0=仅柔化阴影, 1=4方向1px, 2=4方向2px, 3=4方向3px, 4=4方向4px
const buildShadow = (w: number, c: string) => {
    if (w <= 0) return `0 0 3px rgba(0, 0, 0, 0.9)`
    const parts: string[] = []
    for (let i = -w; i <= w; i++) {
        for (let j = -w; j <= w; j++) {
            // 只要四方向边缘（不生成中心点，避免字模糊）
            if ((i === -w || i === w || j === -w || j === w) && !(i === 0 && j === 0)) {
                parts.push(`${i}px ${j}px 0 ${c}`)
            }
        }
    }
    parts.push(`0 0 3px rgba(0, 0, 0, 0.8)`)
    return parts.join(', ')
}

const textStyle = (item: any) => {
    const w = s.value.strokeWidth ?? 1
    const sc = s.value.strokeColor || '#000000'
    const color = s.value.fontColor || item.guard?.fontColor || '#ffffff'
    return { color, 'text-shadow': buildShadow(w, sc) }
}

// ---- 弹幕过滤 ----
const plain = (html: string) => (html || '').replace(/<[^>]+>/g, '')

const isBlocked = (item: any) => {
    const kws = s.value.blockKeywords || []
    const users = s.value.blockUsers || []
    const text = plain(item.comment)
    if (kws.some((k: string) => k && text.includes(k))) return true
    const name = item.userName || ''
    const mid = String(item.mid || '')
    if (users.some((u: string) => u && (name.includes(u) || mid === u))) return true
    return false
}

const visibleComments = computed(() =>
    signalR.data.comments.filter(x => x.mid != '' && !isBlocked(x)))

const direction = ref('translateX(-130px)');


watch(() => props.entryEffectDirection, (newVal) => {
    if (newVal == 'left') {
        direction.value = 'translateX(-130px)'
    } else if (newVal == 'right') {
        direction.value = 'translateX(130px)'
    } else if (newVal == 'bottom') {
        direction.value = 'translateY(130px)'
    }
})



const count = ref(7);



onBeforeMount(() => {

    //弹幕设置
    setInterval(() => {
        var item = signalR.data.queue.dequeue();
        if (item == null) {
            return
        }

        signalR.data.comments.push(item)
        if (signalR.data.comments.length > danmuCount.value) {
            const i = signalR.data.comments.length - danmuCount.value
            for (let index = 0; index < i; index++) {
                signalR.data.comments.shift()
            }
        }

    }, 300);

    //舰长进去
    setInterval(() => {
        var item = signalR.data.entryEffectQueue.dequeue();
        if (item == null) {
            return
        }

        signalR.data.entryEffects.push(item)
        count.value = 7
        if (signalR.data.entryEffects.length > 3) {
            signalR.data.entryEffects.shift()
        }
    }, 300);


    setInterval(() => {
        if (signalR.data.entryEffects.length > 0 && signalR.data.entryEffectQueue.isEmpty) {
            if (count.value <= 0) {
                signalR.data.entryEffects.shift()
            }
        }

        if (count.value != 0) {
            count.value--
        }

    }, 1000);
})

</script>
<style scoped lang="scss">
.danmu {
    padding: 15px;

    .header {
        height: 12.5px;
        text-shadow: 0 0 2px hsl(40, 28.57%, 28.82%), 0 0 2px hsl(40, 28.57%, 28.82%), 0 0 2px hsl(40, 28.57%, 28.82%);
        font-size: 12.5px;
        font-weight: bolder;
        color: white;

        .interactWord {
            margin-left: 20px;
            text-overflow: ellipsis;
        }
    }

    .rows {
        font-size: var(--dm-font-size);
        color: white;
        display: flex;
        flex-direction: column;
        gap: var(--dm-line-gap);

        .message {
            display: flex;
            align-items: center;

            .avatar-medal-name {
                font-size: 13px;
                white-space: nowrap;
                display: flex;
                align-items: center;

                .medal {
                    padding: 1.2px;
                    border-radius: 12%;

                    .medal-name {
                        border: 1px solid orange;
                        background-color: orange;

                        padding: {
                            left: 3px;
                            right: 3px;
                        }
                    }

                    .medal-lvl {
                        border: 1px solid orange;
                        font-weight: bolder;

                        padding: {
                            left: 3px;
                            right: 3px;
                        }
                    }
                }

                .name {
                    margin-right: 3.5px;

                    padding: {
                        left: 3px;
                        right: 3px;
                    }

                    background-color: #9acfd9;
                    border-radius: 10%;
                    color: black;
                }
            }

            .comment {
                vertical-align: middle;
                font-size: var(--dm-font-size);
                font-family: var(--dm-font-family);
                font-weight: var(--dm-font-weight);
            }
        }
    }
}

.entryEffect {
    position: absolute;
    top: 50px;
}


.danmu-move {
    transition: all 0.3s ease;
}

.danmu-enter-active,
.danmu-leave-active {
    position: absolute;
    transition: all 0.3s ease;
}

.danmu-enter-from {
    opacity: 0;
    transform: translateX(-30px);
}

.danmu-leave-to {
    opacity: 0;
    transform: translateX(-30px);
}



.entry-move {
    transition: all 1.2s ease;
}

.entry-enter-active,
.entry-leave-active {
    position: absolute;
    transition: all 1.2s ease;
}

.entry-enter-from {
    opacity: 0;
    transform: v-bind(direction);
}

.entry-leave-to {
    opacity: 0;
    transform: v-bind(direction);
}

li {
    list-style: none;
}

ul {
    padding: 0 0 0 0;
}
</style>
