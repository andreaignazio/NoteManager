<script setup lang="ts">
import { computed, nextTick, ref, unref } from "vue";
import ActionMenuDB from "@/components/ActionMenuDB.vue";
import { useUIOverlayStore } from "@/stores/uioverlay";
import { useAnchorRegistryStore } from "@/stores/anchorRegistry";
import useLiveAnchorRect from "@/composables/useLiveAnchorRect";
import { getIconComponent } from "@/icons/catalog";
import { useOverlayBinding } from "@/composables/useOverlayBinding";

const props = defineProps({
  // 👇 viene passato dall’OverlayHost
  menuId: { type: String, required: true },
  anchorKey: { type: [String, Number], required: true },
  payload: { type: Object, required: true },

  placement: { type: String, default: "center" },
  minWidth: { type: Number, default: 360 },
});

const emit = defineEmits(["close"]);

const uiOverlay = useUIOverlayStore();
const anchorsStore = useAnchorRegistryStore();

const open = ref(false);
const rectTriggerOpen = ref(false);
const menuRef = ref<any>(null);

// checkbox state
const checkboxValue = ref(false);

const token = computed(() => props.payload?.__confirmToken);

const anchorResolved = computed(() =>
  props.anchorKey ? anchorsStore.getAnchorEl(props.anchorKey) : null,
);

const anyOpen = computed(() => open.value || rectTriggerOpen.value);
const { anchorRect, updateNow, scheduleUpdate } = useLiveAnchorRect(
  anchorResolved,
  anyOpen,
);

// -------- UI derivata dal payload --------
const title = computed(() => props.payload?.title ?? "Are you sure?");
const message = computed(() => props.payload?.message ?? "");
const danger = computed(() => !!props.payload?.danger);

const confirmText = computed(() => props.payload?.confirmText ?? "Confirm");
const cancelText = computed(() => props.payload?.cancelText ?? "Cancel");

const checkbox = computed(() => props.payload?.checkbox ?? null);

// icona: default trash
const iconId = computed(() => props.payload?.iconId ?? "lucide:trash-2");

// -------- API --------
async function openPopover() {
  rectTriggerOpen.value = true;
  await nextTick();
  updateNow();
  await new Promise(requestAnimationFrame);
  updateNow();

  if (!anchorRect.value) {
    scheduleUpdate();
    await new Promise(requestAnimationFrame);
  }

  checkboxValue.value = checkbox.value?.defaultValue ?? false;
  open.value = true;
  rectTriggerOpen.value = false;
}

function closePopover(reason: "cancel" | "closed" = "closed") {
  if (token.value) {
    uiOverlay.resolveConfirm(props.menuId, token.value, {
      ok: false,
      reason,
    });
  }
  open.value = false;
  rectTriggerOpen.value = false;
  emit("close");
}

function confirm() {
  if (!token.value) return;
  uiOverlay.resolveConfirm(props.menuId, token.value, {
    ok: true,
    value: checkbox.value ? { checked: checkboxValue.value } : {},
  });
  open.value = false;
  rectTriggerOpen.value = false;
}

defineExpose({
  open: openPopover,
  close: closePopover,
});

useOverlayBinding({
  id: "confirm-popover",
  kind: "modal",
  priority: 230,
  behaviour: "exclusiveKinds",
  exclusiveKinds: ["pie", "dropdown", "hoverbar", "tooltip"],

  isOpen: () => open.value,
  getInteractionScope: () => "local",

  requestClose: () => closePopover("closed"),

  getMenuEl: () => menuRef.value?.el?.value ?? null,
  getAnchorEl: () => anchorResolved.value,

  options: {
    closeOnEsc: true,
    closeOnOutside: true,
    lockScroll: false,
    stopPointerOutside: true,
    allowAnchorClick: true,
    restoreFocus: true,
  },
});
</script>
<template>
  <Teleport to="body">
    <ActionMenuDB
      ref="menuRef"
      :open="open"
      :anchorRect="anchorRect"
      :custom="true"
      :placement="placement"
      :minWidth="minWidth"
      :maxWPost="420"
      :xPost="16"
      :yPost="16"
      @close="closePopover('closed')"
    >
      <div class="confirm-pop">
        <div class="icon-wrap" :class="{ danger }">
          <component :is="getIconComponent(iconId)" :size="28" />
        </div>

        <div class="text-wrap">
          <div class="title">{{ title }}</div>
          <div v-if="message" class="message">{{ message }}</div>
        </div>

        <label v-if="checkbox" class="checkbox">
          <input type="checkbox" v-model="checkboxValue" />
          {{ checkbox.label }}
        </label>

        <div class="actions">
          <button class="btn ghost" @click="closePopover('cancel')">
            {{ cancelText }}
          </button>
          <button class="btn" :class="{ danger }" @click="confirm">
            {{ confirmText }}
          </button>
        </div>
      </div>
    </ActionMenuDB>
  </Teleport>
</template>

<style scoped>
.confirm-pop {
  padding: 18px 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: var(--bg-menu);
  color: var(--text-main);
  border-radius: 18px;
  z-index: 2000;
}

.icon-wrap {
  align-self: center;
  width: 54px;
  height: 54px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-secondary);
}
.icon-wrap.danger {
  background: rgba(255, 59, 48, 0.12);
  color: var(--text-danger);
}

.text-wrap {
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.title {
  font-size: 16px;
  font-weight: 600;
}
.message {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.checkbox {
  display: flex;
  gap: 8px;
  font-size: 13px;
  align-items: center;
  color: var(--text-secondary);
}

.actions {
  margin-top: 6px;
  display: flex;
  justify-content: center;
  gap: 12px;
}

.btn {
  padding: 8px 18px;
  border-radius: 999px;
  font-size: 14px;
  border: 0;
  cursor: pointer;
  background: var(--bg-hover);
  color: var(--text-main);
}
.btn.ghost {
  background: transparent;
  border: 1px solid var(--border-menu);
}
.btn.danger {
  background: var(--bg-menu-danger);
  color: var(--text-danger);
}
.btn:hover {
  filter: brightness(1.05);
}
</style>
