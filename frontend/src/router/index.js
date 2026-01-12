import { createRouter, createWebHistory } from 'vue-router';
import LoginView from '../views/LoginView.vue';
// Importiamo un placeholder per la home protetta
import AppShell from '../views/AppShell.vue'; 
import PageView from '../views/PageView.vue';

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: LoginView,
  },
  {
    path: '/',
    name: 'App',
    component: AppShell,
    meta: { requiresAuth: true }, // 🔒 Rotta protetta
    children: [
        // Qui metteremo le pagine in futuro
        {
          path: '/pages/:id',
          name: 'pageDetail',
          component: PageView,
          props: true
        }
    ]
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// Navigation Guard (Il Buttafuori Frontend)
router.beforeEach((to, from, next) => {
  const isAuthenticated = localStorage.getItem('auth_token');
  
  if (to.meta.requiresAuth && !isAuthenticated) {
    next('/login');
  } else {
    next();
  }
});

export default router;