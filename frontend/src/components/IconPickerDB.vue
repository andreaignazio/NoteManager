<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  // compat: può essere Array<string> (vecchio) oppure Array<IconItem> (nuovo)
  icons: { type: Array, default: () => [] },
})

const emit = defineEmits(['select', 'close'])

const q = ref('')

// normalizza: stringa -> oggetto “fake”
const normalized = computed(() => {
  return (props.icons ?? []).map((x) => {
    if (typeof x === 'string') {
      return { id: x, label: x, icon: null, keywords: [], category: '' }
    }
    // icon item lucide
    return {
      id: x.id ?? '',
      label: x.label ?? x.id ?? '',
      icon: x.icon ?? null,
      keywords: x.keywords ?? [],
      category: x.category ?? '',
    }
  })
})

const filtered = computed(() => {
  const query = (q.value ?? '').trim().toLowerCase()
  if (!query) return normalized.value

  return normalized.value.filter((x) => {
    const hay = [
      x.id,
      x.label,
      ...(x.keywords ?? []),
      x.category ?? '',
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return hay.includes(query)
  })
})

function pick(item) {
  // compat: emettiamo SEMPRE una stringa come prima
  // per lucide sarà "lucide:folder"
  emit('select', item.id)
}
</script>

<template>
  <div class="picker">
    <div class="top">
      <input
        class="search"
        v-model="q"
        type="text"
        placeholder="Search"
        autocomplete="off"
      />
      <button class="x" type="button" @click="$emit('close')">✕</button>
    </div>

    <div class="grid" role="list">
      <button
        v-for="it in filtered"
        :key="it.id"
        class="cell"
        type="button"
        @click="pick(it)"
        :title="it.label || it.id"
      >
        <!-- nuovo: componente lucide -->
        <component v-if="it.icon" :is="it.icon" :size="18" />
        <!-- compat vecchio: emoji/stringa -->
        <span v-else>{{ it.label }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.picker {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.top {
  display: flex;
  gap: 8px;
  align-items: center;
}

.search {
  flex: 1;
  height: 32px;
  border-radius: 10px;
  border: 1px solid rgba(0,0,0,.10);
  background: rgba(0,0,0,.02);
  padding: 0 10px;
  outline: none;
  font-size: 13px;
}

.search:focus {
  border-color: rgba(0,0,0,.25);
  background: rgba(0,0,0,.03);
}

.x {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  border: 0;
  background: rgba(0,0,0,.06);
  cursor: pointer;
}

.x:hover { background: rgba(0,0,0,.10); }

.grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 6px;
  max-height: 260px;
  overflow: auto;
  padding: 2px;
}

.cell {
  height: 32px;
  border-radius: 10px;
  border: 0;
  background: transparent;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;

  /* centra bene le icone lucide */
  display: flex;
  align-items: center;
  justify-content: center;
}

.cell:hover { background: rgba(0,0,0,.06); }
.cell:active { background: rgba(0,0,0,.10); }
</style>
