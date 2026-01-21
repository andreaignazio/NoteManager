<script setup>
import { computed, ref, unref, defineExpose } from 'vue';
import ActionMenuDB from '@/components/ActionMenuDB.vue'
import IconPickerDB from '@/components/IconPickerDB.vue'    
import { useOverlayLayer } from '@/composables/useOverlayLayer'
import { ICONS } from "@/icons/catalog"
import useLiveAnchorRect from '@/composables/useLiveAnchorRect'



const props = defineProps({
  pageId: { type: [String, Number], default: null },
  blockId: { type: [String, Number], default: null },
  anchorEl: { type: [Object, null], default: null }, // HTMLElement | ref
  placement: { type: String, default: 'bottom-end' },
  lockScrollOnOpen: { type: Boolean, default: false },
  anchorLocation: { type: String, default: '' },
})

const emit = defineEmits(['close', 'commit']);

const iconMenuRef = ref(null);
const iconOpen = ref(false);

const iconAnchorResolved = computed(() => unref(props.anchorEl) ?? null)
const { anchorRect: iconAnchorRect, scheduleUpdate: bumpTitleRect } =
  useLiveAnchorRect(iconAnchorResolved, iconOpen)

let layerIdIcon = computed(() => props.pageId ? `${props.anchorLocation}:page-actions:${props.pageId}` : null)

//layerIdIcon = "blblblfdldlf"

const { syncOpen: syncOpenIcon } = useOverlayLayer(
  layerIdIcon,
  () => ({
    getMenuEl: () => iconMenuRef.value?.getMenuEl?.() ?? null,
    getAnchorEl: () => iconAnchorResolved.value,
    close: () => closeIconPicker(),
    options: {
      closeOnEsc: true,
      closeOnOutside: true,
      stopPointerOutside: true,
      lockScroll: !!props.lockScrollOnOpen,
      restoreFocus: true,
      allowAnchorClick: true,
    },
  })
)
//const test = computed(() => !!layerId.value && anyOpen.value)
syncOpenIcon(computed(() => !!layerIdIcon && iconOpen.value))

function closeIconPicker() {
  iconOpen.value = false;
}
function openIconPicker() {
    console.log("openIconPicker called");
  iconOpen.value = true;
  nextTick(() => bumpTitleRect())
}

function onSelectIcon(selectedIcon) {
  // Emit event to parent with selected icon
  emit('commit', selectedIcon);
  closeIconPicker();
}

defineExpose({
  openIconPicker,
  closeIconPicker,
});

</script>

<template>
 <!-- Icon picker popover (layered) --> 
  <Teleport to="body">
    <ActionMenuDB
    ref="iconMenuRef"
      :open="iconOpen"
      :anchorRect="iconAnchorRect"
      :anchorEl="anchorEl"
      custom
      placement="left-start"
      :minWidth= "320"
      :gap="6"
      :sideOffsetX=0
      @close="closeIconPicker"
    >
      <IconPickerDB
        :icons="ICONS"
        @select="onSelectIcon"
        @close="closeIconPicker"  
      />
    </ActionMenuDB>
</Teleport>
</template>

<style scoped>
</style>