<script setup>
import { ref } from 'vue'
import ActionMenuDB from '@/components/ActionMenuDB.vue'

const props = defineProps({
  open: Boolean,
  anchorRect: Object,
  anchorEl: [Object, null],
  items: { type: Array, default: () => [] },
  placement: { type: String, default: 'right' },
  sideOffsetX: { type: Number, default: -12 },
})
function getItemElById(id) {
  return menuRef.value?.getItemElById?.(id) ?? null
}

const emit = defineEmits(['action', 'close'])

const menuRef = ref(null)
function getMenuEl() {
  return menuRef.value?.getMenuEl?.() ?? null
}

defineExpose({ menuRef, getItemElById, getMenuEl  })
</script>

<template>
  <ActionMenuDB
    ref="menuRef"
    :open="open"
    :anchorRect="anchorRect"
    :anchorEl="anchorEl"
    :items="items"
    :placement="placement"
    :sideOffsetX="sideOffsetX"
    :closeOnAction="false"
    @action="emit('action', $event)"
    @close="emit('close')"
  />
</template>
