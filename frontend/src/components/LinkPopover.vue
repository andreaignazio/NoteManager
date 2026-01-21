<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue"
import { computeFloatingPosition } from "@/utils/computeFloatingPosition"
import { useEditorRegistryStore } from "@/stores/editorRegistry"
import { useOverlayStore } from "@/stores/overlay"
import PagePickerList from "@/components/PagePickerList.vue" // <- aggiusta path

const props = defineProps<{
  open: boolean
  blockId: string
  currentPageId?: string | null
  anchorRect: { left:number; right:number; top:number; bottom:number; width:number; height:number }
  initialHref?: string | null
}>()

const overlay = useOverlayStore()
const editorReg = useEditorRegistryStore()

const href = ref(props.initialHref ?? "")
const urlInputEl = ref<HTMLInputElement | null>(null)
const pagePickerRef = ref<any>(null)

watch(() => props.initialHref, (v) => { href.value = v ?? "" })

const pos = computed(() => {
  const r = props.anchorRect
  const x = (r.left + r.right) / 2
  const y = r.bottom
  return computeFloatingPosition({
    x, y,
    w: 360,
    h: 420,
    tx: 0.5,
    ty: 0,
    margin: 10,
  })
})

function close() {
  // adatta al tuo overlay store
  overlay.close?.("link-popover") ?? overlay.closeTop?.()
}

function applyLink(url: string) {
  const ed = editorReg.getEditor(props.blockId)
  if (!ed) return
  const u = (url ?? "").trim()
  if (!u) return

  ed.chain().focus().setLink({ href: u }).run()
  close()
}

function removeLink() {
  const ed = editorReg.getEditor(props.blockId)
  if (!ed) return
  ed.chain().focus().unsetLink().run()
  close()
}

function onPickPage(pageId: string) {
  // scegli uno schema interno:
  // 1) route
  applyLink(`/page/${pageId}`)

  // 2) oppure schema custom:
  // applyLink(`app:page:${pageId}`)
}

watch(
  () => props.open,
  async (v) => {
    if (!v) return
    await nextTick()
    urlInputEl.value?.focus()

    // prepara lista pagine (fetch + auto expand + reset query)
    await pagePickerRef.value?.resetAndPrepare?.()
  },
  { immediate: true }
)
</script>

<template>
  <div v-if="open" class="wrap" :style="{ left: pos.x + 'px', top: pos.y + 'px' }">
    <div class="card">
      <div class="top">
        <div class="row">
          <input
            ref="urlInputEl"
            class="in"
            v-model="href"
            placeholder="Paste URL…"
            @keydown.enter.prevent="applyLink(href)"
          />
          <button class="btn" type="button" @click="applyLink(href)">Apply</button>
        </div>

        <div class="row actions">
          <button
            class="btn ghost"
            type="button"
            @click="removeLink"
            :disabled="!(initialHref && initialHref.length)"
            title="Remove link"
          >
            Remove
          </button>
          <button class="btn ghost" type="button" @click="close">Close</button>
        </div>
      </div>

      <div class="divider"></div>

      <PagePickerList
        ref="pagePickerRef"
        title="Link to a page"
        :currentPageId="currentPageId ?? null"
        :enableSearch="true"
        :fetchIfEmpty="true"
        @select="onPickPage"
      />
    </div>
  </div>
</template>

<style scoped>
.wrap{
  position: fixed;
  transform: translate(-50%, 0%);
  z-index: 2005;
  pointer-events: auto;
}
.card{
  width: 360px;
  max-height: 520px;
  border-radius: 14px;
  background: var(--bg-menu, rgba(255,255,255,.94));
  border: 1px solid rgba(0,0,0,.10);
  box-shadow: 0 18px 50px rgba(0,0,0,.18);
  overflow: hidden;
}
.top{
  padding: 10px;
}
.row{
  display:flex;
  gap: 8px;
  align-items:center;
}
.row.actions{
  margin-top: 8px;
  justify-content: flex-end;
}
.in{
  flex: 1 1 auto;
  height: 34px;
  border-radius: 10px;
  border: 1px solid rgba(0,0,0,.12);
  padding: 0 10px;
  outline: none;
  background: rgba(255,255,255,.92);
  color: inherit;
}
.btn{
  height: 34px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid rgba(0,0,0,.12);
  background: rgba(0,0,0,.06);
  cursor: pointer;
}
.btn.ghost{ background: transparent; }
.btn:disabled{ opacity: .5; cursor: default; }
.divider{
  height: 1px;
  background: rgba(0,0,0,.08);
}
</style>
