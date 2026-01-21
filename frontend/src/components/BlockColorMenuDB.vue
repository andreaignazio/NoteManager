<script setup>
const props = defineProps({
  textTokens: { type: Array, default: () => [] },
  bgTokens: { type: Array, default: () => [] },

  currentText: { type: String, default: 'default' },
  currentBg: { type: String, default: 'default' },

  labelForText: { type: Function, default: null },
  labelForBg: { type: Function, default: null },

  // ✨ nuove: (opzionali) token -> style inline
  // es: (token) => ({ color: '...' })
  letterStyleForText: { type: Function, default: null },

  // es: (token) => ({ backgroundColor: '...' })
  swatchStyleForBg: { type: Function, default: null },
})

const emit = defineEmits(['setText', 'setBg', 'close', 'done'])
</script>

<template>
  <div class="menu">
    <div class="section">
      <div class="sectionTitle">Text color</div>

      <button
        v-for="t in textTokens"
        :key="'t:' + t"
        class="row"
        :class="{ active: t === currentText }"
        type="button"
        @click="emit('setText', t)"
      >
        <span class="left">
          <!-- Icona A -->
          <span class="textIcon" :style="letterStyleForText ? letterStyleForText(t) : null">
            A
          </span>

          <span class="label">{{ labelForText ? labelForText(t) : t }}</span>
        </span>

        <span class="right">
          <span v-if="t === currentText" class="check" aria-hidden="true">✓</span>
        </span>
      </button>
    </div>

    <div class="divider" />

    <div class="section">
      <div class="sectionTitle">Background color</div>

      <button
        v-for="t in bgTokens"
        :key="'b:' + t"
        class="row"
        :class="{ active: t === currentBg }"
        type="button"
        @click="emit('setBg', t)"
      >
        <span class="left">
          <!-- Swatch -->
          <span class="swatch" :style="swatchStyleForBg ? swatchStyleForBg(t) : null"></span>
          <span class="label">{{ labelForBg ? labelForBg(t) : t }}</span>
        </span>

        <span class="right">
          <span v-if="t === currentBg" class="check" aria-hidden="true">✓</span>
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.menu {
  padding: 6px;
  max-width: 260px;
}

/* Titoli sezione */
.sectionTitle {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  padding: 8px 10px 6px;
}

/* Divisore */
.divider {
  height: 1px;
  margin: 8px 8px;
  background: var(--border-menu);
}

/* Riga */
.row {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;

  padding: 8px 10px;
  border: 0;
  background: transparent;
  border-radius: 10px;
  cursor: pointer;
  text-align: left;
}

.row:hover { background: var(--bg-hover); }
.row:active { background: var(--bg-hover); }

.row.active { background: var(--bg-hover); }

.row:focus-visible {
  outline: 2px solid rgba(0,0,0,.12);
  outline-offset: 2px;
}

/* Left group */
.left {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.label {
  font-size: 14px;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.right {
  width: 18px;
  display: inline-flex;
  justify-content: flex-end;
  color: rgba(0,0,0,.55);
}

.check { font-size: 14px; }

/* “A” icon */
.textIcon {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  display: grid;
  place-items: center;

  font-weight: 700;
  font-size: 14px;

  background: rgba(0,0,0,.02);
  border: 1px solid var(--border-menu);

  /* la lettera prende il colore dal tuo inline style */
  color: inherit;
  opacity: 0.4;
}


/* Swatch */
.swatch {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  border: 1px solid var(--border-menu);

  /* il riempimento lo fa l’inline style backgroundColor */
  background: transparent;
  opacity: .5;
}


/* Focus */
.row:focus-visible {
  outline: 2px solid rgba(255,255,255,.18);
  outline-offset: 2px;
}

</style>
