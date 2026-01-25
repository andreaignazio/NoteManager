<script setup lang="ts">
import { getIconComponent } from "@/icons/catalog";
import { computed } from "vue";

const props = defineProps({
  variant: { type: String as () => "item" | "subtitle", default: "item" },
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

const isSubtitle = computed(() => props.variant === "subtitle");
</script>

<template>
  <div v-if="isSubtitle" class="rowSubtitle" aria-hidden="true">
    <span class="subtitleText">{{ label }}</span>
  </div>

  <button
    v-else
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
    <span class="optionIcon" aria-hidden="true">
      <slot name="leading">
        <!-- fallback default: icon/iconId come prima -->
        <span v-if="icon">{{ icon }}</span>
        <component
          v-else-if="iconId"
          :is="getIconComponent(iconId)"
          :size="16"
        />
      </slot>
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
  --row-py: 8px; /* padding verticale */
  --row-px: 10px; /* padding orizzontale */
  --row-gap: 10px; /* gap tra icon e testo */
  --icon-box: 22px;
  --label-size: 14px;
  --secondary-size: 12px;

  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--row-gap);
  padding: var(--row-py) var(--row-px);
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
  width: var(--icon-box);
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
  font-size: var(--label-size);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.optionSecondary {
  font-size: var(--secondary-size);
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
.rowSubtitle {
  padding: 10px 10px 6px 10px; /* top più arioso, bottom più stretto */
  opacity: 0.72;
  user-select: none;
}

.subtitleText {
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  line-height: 1;
}
</style>
