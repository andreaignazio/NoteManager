<script setup lang="ts">
const props = defineProps({
  fonts: { type: Array, default: () => [] }, // [{id,label,css}]
  current: { type: String, default: "default" },
});
const emit = defineEmits(["set", "close", "done"]);
</script>

<template>
  <div class="p-2">
    <div class="px-2 pb-2 text-xs opacity-60">Font blocco</div>

    <button
      v-for="f in fonts"
      :key="f.id"
      class="w-full flex items-center justify-between gap-3 px-2 py-2 rounded-md hover:bg-black/5 dark:hover:bg-white/5"
      :class="f.id === current ? 'bg-black/5 dark:bg-white/5' : ''"
      type="button"
      @click="emit('set', f.id)"
    >
      <div class="flex flex-col items-start">
        <div class="text-sm">{{ f.label }}</div>
        <div class="text-xs opacity-60" :style="{ fontFamily: f.css }">
          The quick brown fox
        </div>
      </div>

      <div class="text-xs opacity-60" v-if="f.id === current">✓</div>
    </button>

    <div class="mt-2 flex justify-end gap-2 px-2">
      <button
        class="text-sm opacity-70 hover:opacity-100"
        @click="emit('close')"
      >
        Annulla
      </button>
      <button
        class="text-sm opacity-70 hover:opacity-100"
        @click="emit('done')"
      >
        Chiudi
      </button>
    </div>
  </div>
</template>
