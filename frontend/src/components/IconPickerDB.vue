<script setup>
import { computed, ref } from 'vue'
import { getIconComponent } from '@/icons/catalog'

const props = defineProps({
  // compat: può essere Array<string> (vecchio) oppure Array<IconItem> (nuovo)
  icons: { type: Array, default: () => [] },
})

const emit = defineEmits(['select', 'close'])

const q = ref('')


const normalized = computed(() => {
  return (props.icons ?? []).map((x) => {
    if (typeof x === 'string') {
      return { id: x, label: x, icon: null, keywords: [], category: '' }
    }

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
       <button class="x" type="button" @click="$emit('close')">
       <component :is="getIconComponent('lucide:x')" :size="18" />
       </button> 
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
  border: 1.2px solid var(--border-menu);
  background: var(--bg-search) !important;
  padding: 0 10px;
  outline: none;
  font-size: 13px;
  color: var(--text-secondary);
  transition: color 0.2s, background 0.2s, border 0.2s ease-in-out;
}

.search:focus {
  border: 1px solid;
  border-color: var(--border-menu-focus);
  color: var(--text-main);
  background: var(--bg-search-focus);
}

.x {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  border: 0;
  background: var(--bg-icon-dark);
  cursor: pointer;
  color:var(--text-secondary);
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.x:hover { background: var(--bg-icon-dark-hover); }

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
  background: var(--bg-icon-transp);
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  color: var(--text-secondary);
  /* centra bene le icone lucide */
  display: flex;
  align-items: center;
  justify-content: center;
}

.cell:hover { 
  color:var(--text-main);
  background: var(--bg-icon-hover); 
}
.cell:active { background: var(--bg-icon-hover); }
</style>
