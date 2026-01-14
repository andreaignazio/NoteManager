<script setup>
const props = defineProps({
  textTokens: { type: Array, default: () => [] },
  bgTokens: { type: Array, default: () => [] },
  currentText: { type: String, default: 'default' },
  currentBg: { type: String, default: 'default' },
  labelForText: { type: Function, default: null },
  labelForBg: { type: Function, default: null },
})

const emit = defineEmits(['setText', 'setBg', 'close', 'done'])
</script>

<template>
  <div class="wrap">
    <div class="section">
      <div class="title">Text</div>
      <div class="list">
        <button
          v-for="t in textTokens"
          :key="t"
          class="row"
          :class="{ active: t === currentText }"
          type="button"
          @click="emit('setText', t)"
        >
          <span class="label">{{ labelForText ? labelForText(t) : t }}</span>
        </button>
      </div>
    </div>

    <div class="section">
      <div class="title">Background</div>
      <div class="list">
        <button
          v-for="t in bgTokens"
          :key="t"
          class="row"
          :class="{ active: t === currentBg }"
          type="button"
          @click="emit('setBg', t)"
        >
          <span class="label">{{ labelForBg ? labelForBg(t) : t }}</span>
        </button>
      </div>
    </div>

    <div class="footer">
      <button class="btn" type="button" @click="emit('close')">Back</button>
      <button class="btn primary" type="button" @click="emit('done')">Done</button>
    </div>
  </div>
</template>

<style scoped>
.wrap { padding: 8px; }
.section { margin-bottom: 10px; }
.title { font-size: 12px; opacity: .7; margin: 6px 4px; }
.list { display: grid; gap: 6px; }
.row {
  width: 100%;
  text-align: left;
  border: 0;
  background: rgba(0,0,0,.04);
  padding: 8px 10px;
  border-radius: 10px;
  cursor: pointer;
}
.row:hover { background: rgba(0,0,0,.06); }
.row.active { outline: 2px solid rgba(0,0,0,.18); }
.footer { display: flex; justify-content: space-between; gap: 8px; margin-top: 10px; }
.btn { border: 0; background: rgba(0,0,0,.06); padding: 8px 10px; border-radius: 10px; cursor: pointer; }
.btn.primary { background: rgba(0,0,0,.10); }
</style>
