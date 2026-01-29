<script setup>
import {
  computed,
  nextTick,
  ref,
  watch,
  onMounted,
  onBeforeUnmount,
  toRef,
} from "vue";
import { storeToRefs } from "pinia";

import usePagesStore from "@/stores/pages";
import { useUiStore } from "@/stores/ui";

import { usePageTitleEditor } from "@/composables/page/usePageTitleEditor";
import { useAppActions } from "@/actions/useAppActions";
import SingleDocEditor from "@/components/SingleDocEditor.vue";
import useDocStore from "@/stores/docstore";

const ui = useUiStore();
const pagesStore = usePagesStore();
const actions = useAppActions();
const docStore = useDocStore();

const { currentPageId } = storeToRefs(pagesStore);

const props = defineProps({
  id: String,
});

//===LAYOUT TICK ON RESIZE===
const layoutTick = ref(0);
const bumpLayoutTick = () => {
  layoutTick.value++;
};

onMounted(() => window.addEventListener("resize", bumpLayoutTick));
onBeforeUnmount(() => window.removeEventListener("resize", bumpLayoutTick));

//===PAGE TITLE EDITOR===
const titleInputEl = ref(null);

const pageIdRef = toRef(props, "id");
const {
  onTitleInput,
  titleValueForInput,
  isUntitled,
  onTitleMouseDown,
  onTitleFocus,
  onTitleBlur,
  onTitleKeydown,
} = usePageTitleEditor(pageIdRef);

function focusTitleInput() {
  nextTick(() => {
    console.log("[SingleDocPageView] focusTitleInput");
    titleInputEl.value?.focus();
    const val = titleInputEl.value?.value || "";
    titleInputEl.value?.setSelectionRange(val.length, val.length);
  });
}

function logDocStructure() {
  if (!props.id) return;
  const doc = docStore.docForPage(props.id);
  console.log("Doc structure:", doc?.content ?? null);
}

watch(
  () => pagesStore.pendingFocusTitlePageId,
  (newPageId) => {
    if (newPageId === props.id) {
      const storedTitle = pagesStore.pagesById?.[String(newPageId)]?.title;
      const title = storedTitle ?? titleValueForInput.value;
      console.log("[SingleDocPageView] pendingFocusTitlePageId", {
        pageId: newPageId,
        title,
      });
      if (storedTitle === undefined) {
        console.log("[SingleDocPageView] skip focus (title not loaded)");
      } else if (String(title ?? "").trim() === "") {
        focusTitleInput();
      } else {
        console.log("[SingleDocPageView] skip focus (title not empty)");
      }
      actions.pages.consumeTitleFocusRequest(newPageId);
    }
  },
);

//===LOAD PAGE ON ID CHANGE===
watch(
  () => props.id,
  async (newId) => {
    if (!newId) return;
    ui.setLastOpenedPageId(newId);
    console.log("[SingleDocPageView] load page", { pageId: newId });
    await actions.pages.openPage(newId);
    const storedTitle = pagesStore.pagesById?.[String(newId)]?.title;
    const title = storedTitle ?? titleValueForInput.value;
    console.log("[SingleDocPageView] title after load", {
      pageId: newId,
      title,
      storedTitle,
    });
    if (storedTitle === undefined) {
      console.log("[SingleDocPageView] skip focus (title not loaded)");
      return;
    }
    if (String(title ?? "").trim() === "") {
      focusTitleInput();
    } else {
      console.log("[SingleDocPageView] skip focus (title not empty)");
    }
    if (title.trim() === "") {
      focusTitleInput();
    } else {
      console.log("[SingleDocPageView] skip focus (title not empty)");
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="page">
    <div class="lane">
      <!-- TITLE -->
      <div class="title-row" v-if="currentPageId">
        <div class="gutter" aria-hidden="true"></div>
        <div class="content">
          <div class="title-with-actions">
            <input
              ref="titleInputEl"
              class="page-title-input"
              :class="{ muted: isUntitled }"
              :value="titleValueForInput"
              @focus="onTitleFocus"
              @blur="onTitleBlur"
              @keydown="onTitleKeydown"
              @input="onTitleInput"
              @mousedown="onTitleMouseDown"
              placeholder="Untitled"
            />
            <!-- <button class="test-doc-btn" type="button" @click="logDocStructure">
              Test
            </button>-->
          </div>
        </div>
      </div>

      <!-- SINGLE DOC EDITOR -->
      <div class="doc-row">
        <div class="gutter" aria-hidden="true"></div>
        <div class="content">
          <SingleDocEditor v-if="id" :pageId="id" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px;
  padding-left: 60px;
  padding-right: 80px;
}

/* Lane condivisa (titolo + doc) */
.lane {
  display: grid;
  grid-template-columns: var(--block-gutter) 1fr;
  column-gap: var(--block-gap);
}

/* Titolo usa la stessa griglia */
.title-row {
  grid-column: 1 / -1;
  display: contents;
}

.title-row > .content {
  padding: 0 var(--block-row-pad-x);
  margin-bottom: 6px;
}

.doc-row > .content {
  min-height: 70vh;
  padding-bottom: 40vh;
}

.title-with-actions {
  display: flex;
  align-items: flex-end;
  gap: 12px;
}

.page-title-input {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-main);
  font-size: 52px;
  font-weight: 700;
  line-height: 2;
  padding: 2px 0;
}

.test-doc-btn {
  border: 1px solid var(--border-divider);
  background: var(--bg-card, rgba(255, 255, 255, 0.04));
  color: var(--text-secondary);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  height: 32px;
}

.test-doc-btn:hover {
  color: var(--text-main);
  background: var(--bg-hover);
}

.page-title-input.muted {
  opacity: 0.45;
}

.doc-row {
  grid-column: 1 / -1;
  display: contents;
}

.doc-row > .content {
  padding: 0 var(--block-row-pad-x);
}
</style>
