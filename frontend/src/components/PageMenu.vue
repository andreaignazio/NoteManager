<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  pagesMenu: {
    type: Object,
    required: true, // { open, pageId, anchorRect }
  },
})

defineEmits(['rename', 'delete','close-menu'])

const menuEl = ref(null) 
defineExpose({ menuEl })

const menuStyle = computed(() => {
    //console.log(props.pagesMenu)

  const r = props.pagesMenu?.anchorRect
  if (!r) return { display: 'none' }

  const GAP = 6
  const MIN_W = 220

  // Allinea a sinistra del bottone; se vuoi allineare a destra, vedi nota sotto.
  let left = r.left
  let top = r.bottom + GAP

  // Clamp orizzontale (semplice)
  const maxLeft = window.innerWidth - MIN_W - 8
  if (left > maxLeft) left = Math.max(8, maxLeft)
  if (left < 8) left = 8

  // Clamp verticale semplice
  const maxTop = window.innerHeight - 200
  if (top > maxTop) top = Math.max(8, maxTop)

  return {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
  }
})

</script>

<template>
  <div
    v-if="pagesMenu.isOpen"
    ref="menuEl"
    class="menu"
    :style="menuStyle"
    role="menu"
    aria-label="Page options menu"
  >
    <ul class="menuList">
      <li class="menuItem">
        <button
          class="optionBtn"
          type="button"
          role="menuitem"
          @click="$emit('rename', pagesMenu.pageId); $emit('close-menu')"
          
        >
          <span class="optionIcon" aria-hidden="true">✏️</span>
          <span class="optionLabel">Rename</span>
        </button>
      </li>

      <li class="menuItem">
        <button
          class="optionBtn danger"
          type="button"
          role="menuitem"
          @click="$emit('delete', pagesMenu.pageId); $emit('close-menu')"
        >
          <span class="optionIcon" aria-hidden="true">🗑️</span>
          <span class="optionLabel">Delete</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.menu {
  position: fixed; /* ancorato al viewport usando getBoundingClientRect */
  z-index: 1000;
  min-width: 220px;

  background: #fff;
  border: 1px solid rgba(0,0,0,.10);
  border-radius: 12px;
  box-shadow: 0 12px 30px rgba(0,0,0,.14);

  padding: 6px;
}

.menuList {
  list-style: none;
  margin: 0;
  padding: 0;
}

.menuItem {
  margin: 0;
  padding: 0;
}

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
}

.optionBtn:hover {
  background: rgba(0,0,0,.06);
}

.optionBtn:active {
  background: rgba(0,0,0,.09);
}

.optionIcon {
  width: 22px;
  display: inline-flex;
  justify-content: center;
}

.optionLabel {
  font-size: 14px;
  line-height: 1.2;
}

.optionBtn.active {
  background: rgba(0,0,0,.08);
}

/* Extra: stile “danger” coerente con lo stesso look */
.optionBtn.danger .optionLabel {
  color: #b42318;
}
</style>