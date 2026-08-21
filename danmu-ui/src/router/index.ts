import { createRouter, createWebHashHistory } from 'vue-router'

// 桌面端从本地 file:// 加载，必须使用 hash 模式（history 模式在 file:// 下深链会失败）
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: "/",
      redirect: "/login",
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/Login.vue')
    },
    {
      path: '/home',
      name: 'home',
      component: () => import('../views/Home.vue')
    },
    {
      path: '/overlay',
      name: 'overlay',
      component: () => import('../views/Overlay.vue')
    },
    {
      // OBS 浏览器源弹幕页：无 Electron 依赖，纯浏览器环境显示弹幕（透明背景）
      path: '/obs',
      name: 'obs',
      component: () => import('../views/ObsDanmu.vue')
    },
    {
      path: '/shortKey',
      name: 'shortKey',
      component: () => import('../views/ShortKey.vue')
    },
  ]
})




// {
//   path: '/login',
//   name: 'login',
//   component: () => import('../views/Login.vue')
// },


export default router
