<script setup>
import { ref } from 'vue'
import ActionMenuDB from '@/components/ActionMenuDB.vue'

const props = defineProps({
  open: Boolean,
  anchorRect: Object,
  anchorEl: [Object, null],
  items: { type: Array, default: () => [] },
  activeId: { type: String, default: null },
  placement: { type: String, default: 'right-start' },
  sideOffsetX: { type: Number, default: 0 },
})

const emit = defineEmits(['action', 'close'])

const menuRef = ref(null)

function getMenuEl() {
  //console.log("BlTypeDB_menu:", menuRef.value.getBoundingClientRect())
  return menuRef.value?.getMenuEl?.() ?? null

}

defineExpose({ menuRef, getMenuEl  })
</script>

<template>
  <ActionMenuDB
    ref="menuRef"
    :open="open"
    :anchorRect="anchorRect"
    :anchorEl="anchorEl"
    :items="items"
    :activeId="activeId"
    :placement="placement"
    :sideOffsetX="sideOffsetX"
    :closeOnAction="false"
    @action="emit('action', $event)"
    @close="emit('close')"
  />
</template>
