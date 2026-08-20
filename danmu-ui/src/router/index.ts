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
