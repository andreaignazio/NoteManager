<script setup>
import { ref } from 'vue'

const props = defineProps({
  kind: { type: String, required: true }, // 'ul'|'ol'|'todo'|'callout'
  olNumber: { type: [String, Number], default: '' },

  // todo
  checked: { type: Boolean, default: false },

  // callout
  CalloutIcon: { type: [Object, Function, null], default: null },
})

const emit = defineEmits([
  'toggle-todo',
  'open-callout-icon',
])

const calloutBtnEl = ref(null)

defineExpose({ getCalloutBtn: () => calloutBtnEl.value })
</script>

<template>
  <div class="gutter-wrap" :class="`kind-${kind}`">
    <!-- GUTTER -->
    <div class="gutter">
      <template v-if="kind === 'ul'">
        <span class="bullet">•</span>
      </template>

      <template v-else-if="kind === 'ol'">
        <span class="num">{{ olNumber }}.</span>
      </template>

      <template v-else-if="kind === 'todo'">
        <button
          class="todoBox"
          type="button"
          role="checkbox"
          :data-checked="checked"
          :aria-checked="checked ? 'true' : 'false'"
          @click.stop="$emit('toggle-todo', $event)"
        >
          <span v-if="checked" class="todoCheck">✓</span>
        </button>
      </template>

      <template v-else-if="kind === 'callout'">
        <button
          ref="calloutBtnEl"
          class="calloutIconBtn"
          type="button"
          @click.stop="$emit('open-callout-icon')"
          title="Change icon"
        >
          <component v-if="CalloutIcon" :is="CalloutIcon" :size="15" class="calloutIcon" />
          <span v-else class="calloutIconPlaceholder">+</span>
        </button>
      </template>
    </div>

    <!-- CONTENT -->
    <div class="content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.gutter-wrap{
  --gutter-w: 28px;
  --translate-x: -10px;

  display:grid;
  grid-template-columns: var(--gutter-w) 1fr;
  column-gap: 8px;
  align-items: start;
  justify-items: start;
  
}

.gutter{
  width: var(--gutter-w);
  display:flex;
  justify-content:flex-end;
 
  padding-top: calc((1.5em - 1em) / 2);
}

.content{
  min-width: 0;
  cursor: text;
}

.bullet{
  opacity:.75;
  color: var(--text-main);
  font-size: 1.4em;
  line-height: .75em;
  transform: translateX(calc(var(--translate-x) - 4px));
  /*transform: translateY(0.02em);*/
}
.num{
  opacity:.75;
  color: var(--text-main);
  font-size: .9em;
  line-height:1.25em;
  transform: translateX(calc(var(--translate-x) - 2px));
 /* transform: translateY(0.45em);*/
}

/* todo */
.todoBox{
  width: 16px;
  height: 16px;
  border-radius: 2px;
  border: 1.5px solid var(--border-todo);
  background: transparent;
  display: grid;
  place-items: center;
  cursor: pointer;
  transform: translateY(0.35em);
  transform: translateX(calc(var(--translate-x) + 0px));
  transition: background .12s ease, border-color .12s ease;
}
.todoBox[data-checked="true"]{
  background: #2f80ed;
  border-color: #2f80ed;
}
.todoCheck{
  font-size: 11px;
  line-height: 1;
  color: #fff;
  transform: translateY(0.05em) translateX(-0.25em);
}

/* callout */
.calloutIconBtn {
  width: 38px;
  height: 38px;
  border-radius: 8px;
  border: 0;
  background: var(--bg-icon-transp);
  display: grid;
  place-items: center;
  cursor: pointer;
  color: var(--text-main);
  transform: translateY(0.15em);
}
.calloutIconBtn:hover { background: var(--bg-icon-hover); }
.calloutIcon { width: 18px; height: 18px; opacity: .85; }
.calloutIconPlaceholder { font-size: 16px; opacity: .55; }

:deep(.tiptap-editor-content),
:deep(.ProseMirror) {
  padding: 0;
  margin: 0;
  outline: none;
  line-height: 1.4;
  width: 100%;
  min-width: 0;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
}
:deep(.ProseMirror p) {
  margin: 0;
  line-height: inherit;
}
</style>
