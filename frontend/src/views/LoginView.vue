<script setup>
import { ref } from "vue";
import router from "@/router";
import api from "@/services/api";
import useAuthStore from "@/stores/auth";
const authStore = useAuthStore();

const username = ref("");
const password = ref("");

const errorMsg = ref("");

const handleLogin = async () => {
  try {
    await authStore.login(username.value, password.value);
    router.push("/");
  } catch {
    errorMsg.value = "Login error, wrong credentials";
  }
};

const handleRegister = async () => {
  try {
    const response = await authStore.register(
      username.value,
      password.value,
      password.value,
    );
    errorMsg.value = "Successfully registered";
  } catch {
    errorMsg.value = "Registration Error";
  }
};
</script>

<template>
  <div class="page">
    <div class="card">
      <div class="header">
        <div class="logo">✳︎</div>
        <div class="titles">
          <h1 class="title">NoteManager</h1>
          <div class="subtitle">Sign in to continue</div>
        </div>
      </div>

      <div class="form">
        <label class="field">
          <div class="label">Username</div>
          <input
            v-model="username"
            class="input"
            placeholder="Your username"
            autocomplete="username"
          />
        </label>

        <label class="field">
          <div class="label">Password</div>
          <input
            v-model="password"
            type="password"
            class="input"
            placeholder="Your password"
            autocomplete="current-password"
          />
        </label>

        <div
          v-if="errorMsg"
          class="notice"
          :class="{ ok: errorMsg.includes('Successfully') }"
        >
          {{ errorMsg }}
        </div>

        <div class="actions">
          <button @click="handleLogin" class="btn primary" type="button">
            Login
          </button>
          <button @click="handleRegister" class="btn" type="button">
            Register
          </button>
        </div>

        <div class="hint">Tab to switch fields · Enter to submit</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background:
    radial-gradient(
      1200px 600px at 20% 20%,
      rgba(0, 0, 0, 0.04),
      transparent 60%
    ),
    radial-gradient(
      900px 500px at 80% 40%,
      rgba(0, 0, 0, 0.03),
      transparent 55%
    ),
    #fafafa;
}

.card {
  width: min(420px, 100%);
  border-radius: 14px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(8px);
  padding: 18px;
}

.header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.logo {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.06);
  border: 1px solid rgba(0, 0, 0, 0.1);
  font-weight: 800;
  user-select: none;
}

.titles {
  min-width: 0;
}

.title {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  letter-spacing: 0.01em;
  color: rgba(0, 0, 0, 0.86);
}

.subtitle {
  margin-top: 2px;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.55);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(0, 0, 0, 0.55);
}

.input {
  height: 34px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: rgba(0, 0, 0, 0.02);
  padding: 0 10px;
  font-size: 13px;
  font-weight: 650;
  color: rgba(0, 0, 0, 0.8);
  outline: none;
}

.input:focus {
  border-color: rgba(0, 0, 0, 0.25);
  background: rgba(0, 0, 0, 0.03);
}

.notice {
  border-radius: 12px;
  border: 1px solid rgba(176, 0, 32, 0.25);
  background: rgba(176, 0, 32, 0.06);
  color: rgba(176, 0, 32, 0.9);
  padding: 10px 12px;
  font-size: 13px;
}

.notice.ok {
  border-color: rgba(0, 128, 64, 0.25);
  background: rgba(0, 128, 64, 0.06);
  color: rgba(0, 128, 64, 0.9);
}

.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 2px;
}

.btn {
  height: 36px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: rgba(255, 255, 255, 0.75);
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  color: rgba(0, 0, 0, 0.8);
}

.btn:hover {
  background: #fff;
}

.btn.primary {
  background: rgba(0, 0, 0, 0.86);
  border-color: rgba(0, 0, 0, 0.86);
  color: #fff;
}

.btn.primary:hover {
  background: rgba(0, 0, 0, 0.92);
}

.hint {
  margin-top: 2px;
  font-size: 11px;
  color: rgba(0, 0, 0, 0.45);
  user-select: none;
}
</style>
