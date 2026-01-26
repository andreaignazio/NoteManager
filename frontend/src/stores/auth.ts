import { defineStore } from "pinia";
import api from "@/services/api";

// ===========================
// TYPE DEFINITIONS
// ===========================

interface User {
  id: string | number;
  username: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  [key: string]: any;
}

interface LoginCredentials {
  username: string;
  password: string;
}

interface RegisterCredentials {
  username: string;
  password: string;
  re_password: string;
}

interface LoginResponse {
  auth_token: string;
  [key: string]: any;
}

interface AuthStoreState {
  token: string | null;
  user: User | null;
}

// ===========================
// STORE DEFINITION
// ===========================

const TOKEN_KEY = "auth_token";

export const useAuthStore = defineStore("authStore", {
  state: (): AuthStoreState => ({
    token: null,
    user: null,
  }),

  getters: {
    isAuthenticated(state): boolean {
      return !!state.token;
    },
  },

  actions: {
    // ===========================
    // INITIALIZATION
    // ===========================

    async init(): Promise<void> {
      const storedToken = localStorage.getItem(TOKEN_KEY);

      if (storedToken) {
        this.token = storedToken;
        await this.fetchMe();
        console.log("Token restored from localStorage");
      } else {
        this.token = null;
      }
    },

    // ===========================
    // FETCH USER
    // ===========================

    async fetchMe(): Promise<void> {
      try {
        const response = await api.get("/auth/users/me/");
        this.user = response.data as User;
      } catch (error) {
        this.logout();
      }
    },

    // ===========================
    // AUTHENTICATION
    // ===========================

    async login(username: string, password: string): Promise<void> {
      try {
        const credentials: LoginCredentials = {
          username,
          password,
        };
        const response = await api.post("/auth/token/login/", credentials);
        this.token = (response.data as LoginResponse).auth_token;
        localStorage.setItem(TOKEN_KEY, this.token);

        await this.fetchMe();
      } catch (error) {
        console.log("Login error:", error);
        throw error;
      }
    },

    async register(
      username: string,
      password: string,
      repassword: string,
    ): Promise<void> {
      try {
        const credentials: RegisterCredentials = {
          username,
          password,
          re_password: repassword,
        };
        const response = await api.post("/auth/users/", credentials);
        // Registration successful, user may need to login
      } catch (error) {
        console.log("Register error:", error);
        throw error;
      }
    },

    async logout(): Promise<void> {
      try {
        await api.post("/auth/token/logout/");
      } catch (error) {
        console.warn("Logout error:", error);
      } finally {
        this.token = null;
        this.user = null;
        localStorage.removeItem(TOKEN_KEY);
      }
    },
  },
});

export default useAuthStore;
