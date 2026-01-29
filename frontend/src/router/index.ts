import {
  createRouter,
  createWebHistory,
  RouteRecordRaw,
  Router,
  NavigationGuardNext,
  RouteLocationNormalized,
} from "vue-router";
import LoginView from "../views/LoginView.vue";
import AppShell from "../views/AppShell.vue";
import SingleDocPageView from "../views/SingleDocPageView.vue";
import HomeLandingView from "../views/HomeLandingView.vue";

// ===========================
// TYPE DEFINITIONS
// ===========================

interface RouteMeta {
  requiresAuth?: boolean;
  [key: string]: any;
}

declare module "vue-router" {
  interface RouteMeta {
    requiresAuth?: boolean;
  }
}

// ===========================
// ROUTES DEFINITION
// ===========================

const routes: RouteRecordRaw[] = [
  {
    path: "/login",
    name: "Login",
    component: LoginView,
  },
  {
    path: "/",
    name: "App",
    component: AppShell,
    meta: { requiresAuth: true },
    children: [
      {
        path: "",
        name: "home",
        component: HomeLandingView,
      },
      {
        path: "pages/:id",
        name: "pageDetail",
        component: SingleDocPageView,
        props: true,
      },
    ],
  },
];

// ===========================
// ROUTER INSTANCE
// ===========================

const router: Router = createRouter({
  history: createWebHistory(),
  routes,
});

// ===========================
// NAVIGATION GUARDS
// ===========================

/**
 * Guard to ensure authentication is required for protected routes
 */
router.beforeEach(
  (
    to: RouteLocationNormalized,
    from: RouteLocationNormalized,
    next: NavigationGuardNext,
  ): void => {
    const isAuthenticated = localStorage.getItem("auth_token");

    if (to.meta.requiresAuth && !isAuthenticated) {
      next("/login");
    } else {
      next();
    }
  },
);

export default router;
