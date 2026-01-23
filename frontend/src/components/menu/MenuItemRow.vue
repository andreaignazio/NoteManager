<script setup lang="ts">
import { getIconComponent } from "@/icons/catalog";

const props = defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  secondary: { type: String, default: "" },
  icon: { type: String, default: "" },
  iconId: { type: String, default: "" },
  hint: { type: String, default: "" },
  active: { type: Boolean, default: false },
  danger: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  hasSubmenu: { type: Boolean, default: false },
});

const emit = defineEmits<{
  (e: "click", ev: MouseEvent): void;
  (e: "enter", ev: PointerEvent): void;
  (e: "leave", ev: PointerEvent): void;
}>();

function onClick(ev: MouseEvent) {
  if (props.disabled) return;
  emit("click", ev);
}
</script>

<template>
  <button
    class="optionBtn"
    :data-menu-item-id="id"
    :class="{ active, danger }"
    :disabled="disabled"
    type="button"
    role="menuitem"
    @click="onClick"
    @pointerenter="emit('enter', $event)"
    @pointerleave="emit('leave', $event)"
  >
    <span v-if="icon" class="optionIcon" aria-hidden="true">{{ icon }}</span>
    <span v-else-if="iconId" class="optionIcon" aria-hidden="true">
      <component :is="getIconComponent(iconId)" :size="16" />
    </span>

    <span class="optionText">
      <span class="optionLabel">{{ label }}</span>
      <span v-if="secondary" class="optionSecondary">{{ secondary }}</span>
    </span>

    <span v-if="hasSubmenu" class="optionChevron" aria-hidden="true">›</span>
  </button>
</template>

<style scoped>
.optionBtn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 0;
  background: transparent;
  border-radius: 10px;
  cursor: pointer;
  text-align: left;
  color: var(--text-main);
}

.optionBtn:hover,
.optionBtn:active,
.optionBtn.active {
  background: var(--bg-hover);
}

.optionBtn.danger:hover {
  background: var(--bg-menu-danger);
  color: var(--text-danger);
}

.optionBtn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.optionIcon {
  width: 22px;
  display: inline-flex;
  justify-content: center;
  flex: 0 0 auto;
}

.optionText {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.optionLabel {
  font-size: 14px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.optionSecondary {
  font-size: 12px;
  line-height: 1.2;
  opacity: 0.65;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.optionChevron {
  margin-left: auto;
  opacity: 0.55;
}

.optionBtn:disabled .optionChevron {
  opacity: 0.35;
}
</style>
