<script setup>
import { computed } from 'vue'
import { Sun, Moon } from 'lucide-vue-next'

const props = defineProps({
  theme: { type: String, default: 'light' }, // 'light' | 'dark'
})

const emit = defineEmits(['toggle'])

const isDark = computed(() => props.theme === 'dark')

function handleToggleTheme() {
  const next = isDark.value ? 'light' : 'dark'
  emit('toggle', next)
}
</script>

<template>
  <button
    class="icon-btn theme-btn"
    :class="{ 'is-dark': isDark }"
    type="button"
    :title="isDark ? 'Switch to light' : 'Switch to dark'"
    @click="handleToggleTheme"
  >
    <component
      :is="isDark ? Sun : Moon"
      class="theme-icon"
      :size="18"
      :stroke-width="2"
    />
  </button>
</template>

<style scoped>
.theme-btn {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0px;
  background: transparent;
  transition: background-color 0.15s ease, transform 0.1s ease;
}

.theme-btn:hover {
  background: var(--bg-bar-btn-hover);
}

.theme-btn:active {
  transform: scale(0.96);
}

.theme-icon {
  color: var(--text-secondary);
  transition: color 0.15s ease, transform 0.15s ease;
}

/* opzionale: quando dark, fai un colore un filo più “accent” */
.theme-btn.is-dark .theme-icon {
  color: var(--text-main);
}
</style>
