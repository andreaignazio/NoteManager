<script setup>
// Qui ci andrà la logica
import useAuthStore from "@/stores/auth";
import useShortcuts from "@/composables/useShortcuts";
import { ref, watch, onMounted } from "vue";
const authStore = useAuthStore();

useShortcuts();

onMounted(() => {
  authStore.init();
});

const token = ref(null);
token.value = authStore.token;
if (!token.value) {
  token.value = "Token null";
}

watch(
  () => authStore.token,
  (newTokenValue) => {
    token.value = authStore.token;
  },
);
</script>

<template>
  <div class="app-container">
    <router-view></router-view>
  </div>
</template>

<style>
/* Reset base dark mode inspired */
:root {
  --bg-color: #d2d2d2;
  --text-color: #242424;
}

body {
  margin: 0;
  background-color: var(--bg-color);
  color: var(--text-color);
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu,
    Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
}
</style>
