<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from "vue";

const props = defineProps({
  rootEl: { type: Object, default: null },
});

const headings = ref([]);
const activeId = ref(null);
const isHovered = ref(false);

let observer = null;
let rafId = 0;
let refreshRaf = 0;

const levelFromType = (type) => (type === "h1" ? 1 : type === "h2" ? 2 : 3);

const lineWidthForLevel = (level) => (level === 1 ? 18 : level === 2 ? 12 : 6);

function collectHeadings() {
  const root = props.rootEl;
  if (!root) {
    headings.value = [];
    activeId.value = null;
    return;
  }

  const nodes = Array.from(
    root.querySelectorAll(
      '.doc-item[data-block-type="h1"], .doc-item[data-block-type="h2"], .doc-item[data-block-type="h3"]',
    ),
  );

  headings.value = nodes.map((el, idx) => {
    const type = el.getAttribute("data-block-type") || "h3";
    const level = levelFromType(type);
    const id = el.getAttribute("data-id") || `heading-${idx}`;
    const headingEl =
      el.querySelector(".doc-node--heading") || el.querySelector("h1, h2, h3");
    const text = (headingEl?.textContent || el.textContent || "").trim();
    return {
      id,
      level,
      text: text || "Untitled heading",
      el,
    };
  });

  nextTick().then(computeActiveHeading);
}

function scheduleCollectHeadings() {
  if (refreshRaf) cancelAnimationFrame(refreshRaf);
  refreshRaf = requestAnimationFrame(collectHeadings);
}

function computeActiveHeading() {
  const items = headings.value;
  if (!items.length) {
    activeId.value = null;
    return;
  }

  const targetY = window.innerHeight * 0.55;
  let current = items[0];
  for (const item of items) {
    const rect = item.el?.getBoundingClientRect?.();
    if (!rect) continue;
    if (rect.top <= targetY) current = item;
  }
  activeId.value = current?.id ?? null;
}

function scheduleActiveCompute() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(computeActiveHeading);
}

function onScroll() {
  scheduleActiveCompute();
}

function onResize() {
  scheduleActiveCompute();
}

function scrollToHeading(item) {
  if (!item?.el) return;
  item.el.scrollIntoView({ behavior: "smooth", block: "center" });
}

function setupObserver() {
  if (!props.rootEl || observer) return;
  observer = new MutationObserver(() => {
    scheduleCollectHeadings();
  });
  observer.observe(props.rootEl, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  scheduleCollectHeadings();
}

function teardownObserver() {
  if (observer) observer.disconnect();
  observer = null;
}

watch(
  () => props.rootEl,
  (el) => {
    teardownObserver();
    if (el) setupObserver();
  },
  { immediate: true },
);

onMounted(() => {
  document.addEventListener("scroll", onScroll, {
    passive: true,
    capture: true,
  });
  window.addEventListener("resize", onResize, { passive: true });
  setupObserver();
});

onBeforeUnmount(() => {
  document.removeEventListener("scroll", onScroll, true);
  window.removeEventListener("resize", onResize);
  teardownObserver();
  if (rafId) cancelAnimationFrame(rafId);
  if (refreshRaf) cancelAnimationFrame(refreshRaf);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="headings.length"
      class="doc-outline"
      :class="{ 'is-open': isHovered }"
      @pointerleave="isHovered = false"
    >
      <div class="doc-outline-anchor">
        <div class="doc-outline-lines" @pointerenter="isHovered = true">
          <button
            v-for="item in headings"
            :key="item.id"
            class="doc-outline-line"
            :class="{ active: item.id === activeId }"
            :style="{ '--line-w': `${lineWidthForLevel(item.level)}px` }"
            type="button"
            :aria-label="item.text"
            @click="scrollToHeading(item)"
          />
        </div>

        <div
          v-show="isHovered"
          class="doc-outline-panel"
          @pointerenter="isHovered = true"
        >
          <div class="doc-outline-title">Index</div>
          <button
            v-for="item in headings"
            :key="`${item.id}-btn`"
            class="doc-outline-item"
            :class="`lvl-${item.level}`"
            type="button"
            @click="scrollToHeading(item)"
          >
            <span class="bullet" aria-hidden="true"></span>
            <span class="text">{{ item.text }}</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.doc-outline {
  position: fixed;
  right: 22px;
  top: 50vh;
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  gap: 12px;
  pointer-events: auto;
  transform: none;
  --outline-panel-width: 240px;
  --outline-gap: 12px;
}

.doc-outline-anchor {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.doc-outline-anchor::before {
  content: "";
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  width: calc(var(--outline-panel-width) + var(--outline-gap) + 32px);
  height: 70vh;
  pointer-events: none;
  z-index: 0;
}

.doc-outline.is-open .doc-outline-anchor::before {
  pointer-events: auto;
}

.doc-outline-lines {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  padding: 6px 0;
  transform: translateY(-50%);
  position: relative;
  z-index: 1;
}

.doc-outline-line {
  width: var(--line-w, 18px);
  height: 3px;
  border-radius: 999px;
  border: none;
  background: color-mix(in srgb, var(--text-secondary) 60%, transparent);
  cursor: pointer;
  transition:
    background 120ms ease,
    width 120ms ease,
    opacity 120ms ease;
  opacity: 0.8;
}

.doc-outline-line:hover {
  opacity: 1;
  background: color-mix(in srgb, var(--text-main) 80%, transparent);
}

.doc-outline-line.active {
  background: var(--text-main);
  opacity: 1;
}

.doc-outline-panel {
  position: absolute;
  right: calc(100% + var(--outline-gap));
  top: 50%;
  transform: translateY(-50%);
  min-width: var(--outline-panel-width);
  max-height: 60vh;
  overflow: auto;
  padding: 8px;
  border-radius: 12px;
  background: var(--bg-menu);
  border: 1.5px solid var(--border-menu);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.16);
  z-index: 1;
}

.doc-outline-title {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 4px 8px 8px;
}

.doc-outline-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: transparent;
  color: var(--text-main);
  text-align: left;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
}

.doc-outline-item:hover {
  background: var(--bg-hover);
}

.doc-outline-item .bullet {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--text-secondary);
  flex: 0 0 auto;
  opacity: 0.7;
}

.doc-outline-item.lvl-1 .text {
  font-weight: 650;
}

.doc-outline-item.lvl-2 .text {
  padding-left: 8px;
}

.doc-outline-item.lvl-3 .text {
  padding-left: 16px;
  opacity: 0.9;
}
</style>
