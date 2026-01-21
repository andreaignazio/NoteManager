<script setup>
import { Star } from 'lucide-vue-next'

const props = defineProps({
  isFavorite: { type: Boolean, default: false },
})

const emit = defineEmits(['toggle'])

function handleToggleFavorite() {
  emit('toggle')
}
</script>

<template>
  <button
    class="icon-btn favorite-btn"
    :class="{ 'is-active': props.isFavorite }"
    type="button"
    title="Favorite"
    @click="handleToggleFavorite"
  >
    <Star
      class="favorite-icon"
      :size="18"
      :stroke-width="2"
      :fill="props.isFavorite ? 'currentColor' : 'none'"
    />
  </button>
</template>

<style scoped>
.favorite-btn {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  background: transparent;
  transition: background-color 0.15s ease, transform 0.1s ease;
}

.favorite-btn:hover {
  background: var(--bg-bar-btn-hover);
}

.favorite-btn.is-active {
  background: transparent;
}

.favorite-btn:active {
  transform: scale(0.96);
}

/* Colore icona: usa currentColor */
.favorite-icon {
  color: var(--text-secondary);
  transition: color 0.15s ease;
}

.favorite-btn.is-active .favorite-icon {
  color: var(--icon-favorite); /* oppure var(--warning) / var(--accent) */
}
</style>
