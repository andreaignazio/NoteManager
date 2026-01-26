<script setup>
import { computed } from "vue";
import { MENU_COMMANDS } from "@/domain/menuActions";

const props = defineProps({
  activeType: { type: String, required: true },
  activeMarks: { type: Object, default: () => ({}) },
});

const emit = defineEmits(["set-type", "command"]);

const canUseEditor = computed(() => true);

function setType(next) {
  emit("set-type", next);
}

const isBold = computed(() => props.activeMarks?.bold ?? false);
const isItalic = computed(() => props.activeMarks?.italic ?? false);
const isStrike = computed(() => props.activeMarks?.strike ?? false);
const isCode = computed(() => props.activeMarks?.code ?? false);
const isLink = computed(() => props.activeMarks?.link ?? false);
</script>

<template>
  <div class="toolbar floating-toolbar">
    <!-- INLINE -->
    <div class="group" v-if="canUseEditor">
      <button
        class="btn"
        :class="{ active: isBold }"
        @mousedown.prevent
        @click="emit('command', MENU_COMMANDS.EDITOR_BOLD)"
      >
        B
      </button>
      <button
        class="btn"
        :class="{ active: isItalic }"
        @mousedown.prevent
        @click="emit('command', MENU_COMMANDS.EDITOR_ITALIC)"
      >
        <em>I</em>
      </button>
      <button
        class="btn"
        :class="{ active: isStrike }"
        @mousedown.prevent
        @click="emit('command', MENU_COMMANDS.EDITOR_STRIKE)"
      >
        <s>S</s>
      </button>
      <button
        class="btn"
        :class="{ active: isCode }"
        @mousedown.prevent
        @click="emit('command', MENU_COMMANDS.EDITOR_TOGGLE_CODE)"
      >
        { }
      </button>
      <button
        class="btn"
        :class="{ active: isLink }"
        @mousedown.prevent
        @click="emit('command', MENU_COMMANDS.EDITOR_OPEN_LINK)"
      >
        🔗
      </button>
    </div>

    <div class="sep" />

    <!-- BLOCK TYPE -->
    <div class="group">
      <button
        class="btn"
        :class="{ active: activeType === 'p' }"
        @mousedown.prevent
        @click="setType('p')"
      >
        T
      </button>
      <button
        class="btn"
        :class="{ active: activeType === 'h1' }"
        @mousedown.prevent
        @click="setType('h1')"
      >
        H1
      </button>
      <button
        class="btn"
        :class="{ active: activeType === 'h2' }"
        @mousedown.prevent
        @click="setType('h2')"
      >
        H2
      </button>
      <button
        class="btn"
        :class="{ active: activeType === 'h3' }"
        @mousedown.prevent
        @click="setType('h3')"
      >
        H3
      </button>
      <button
        class="btn"
        :class="{ active: activeType === 'quote' }"
        @mousedown.prevent
        @click="setType('quote')"
      >
        ❝
      </button>
      <button
        class="btn"
        :class="{ active: activeType === 'ul' }"
        @mousedown.prevent
        @click="setType('ul')"
      >
        •
      </button>
      <button
        class="btn"
        :class="{ active: activeType === 'ol' }"
        @mousedown.prevent
        @click="setType('ol')"
      >
        1.
      </button>
      <button
        class="btn"
        :class="{ active: activeType === 'todo' }"
        @mousedown.prevent
        @click="setType('todo')"
      >
        ☐
      </button>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 10px;
  background: var(--bg-toolbar);
  user-select: none;

  opacity: 1;
}
.group {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}
.sep {
  width: 1px;
  height: 18px;
  background: rgba(0, 0, 0, 0.12);
}
.btn {
  border: none;
  background: transparent;
  border-radius: 8px;
  padding: 4px 6px;
  cursor: pointer;
  line-height: 1;
  color: var(--text-secondary);
}
.btn.active {
  color: var(--text-main);
  background: rgba(0, 0, 0, 0.12);
}
.btn:hover {
  background: var(--text-main);
  background: var(--bg-hover);
}
</style>
