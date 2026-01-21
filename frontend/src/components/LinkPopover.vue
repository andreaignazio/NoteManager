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

const POPOVER_W = 350
const POPOVER_H = 350
const POPOVER_TOP_H = 40
const LIST_H = POPOVER_H - POPOVER_TOP_H
const GAP = 10
const MARGIN = 10

watch(() => props.initialHref, (v) => { href.value = v ?? "" })


const preferAbove = computed(() => {
  const r = props.anchorRect
  const spaceBelow = window.innerHeight - r.bottom
  const spaceAbove = r.top
  // preferisci sotto, ma se non ci sta -> sopra (e se sopra ci sta meglio)
  if (spaceBelow >= POPOVER_H + GAP + MARGIN) return false
  if (spaceAbove >= POPOVER_H + GAP + MARGIN) return true
  // fallback: scegli il lato con più spazio
  return spaceAbove > spaceBelow
})

const pos = computed(() => {
  const r = props.anchorRect
  let x = (r.left + r.right) / 2
  //x = window.innerWidth / 2

  const y = preferAbove.value ? (r.top - GAP) : (r.bottom + GAP)
  const ty = preferAbove.value ? 1 : 0

  return computeFloatingPosition({
    x,
    y,
    w: POPOVER_W,
    h: POPOVER_H,
    tx: 0.5,
    ty,
    margin: MARGIN,
  })
})

function extractPageIdFromHref(raw: string): string | null {
  const s = (raw ?? '').trim()
  // accetta /pages/<id> o pages/<id>
  const m = s.match(/(?:^|\/)pages\/([^/?#]+)/)
  return m?.[1] ? String(m[1]) : null
}

function isProbablyUrl(raw: string): boolean {
  const s = (raw ?? '').trim()
  if (!s) return false
  // url completo o www.
  if (/^https?:\/\//i.test(s)) return true
  if (/^www\./i.test(s)) return true
  // opzionale: dominio.tld (molto permissivo)
  if (/^[\w-]+\.[a-z]{2,}(\/|$)/i.test(s)) return true
  return false
}

const pickedPageIdFromHref = computed(() => extractPageIdFromHref(href.value))

const pickerQuery = computed(() => {
  const s = (href.value ?? '').trim()
  if (!s) return ''
  if (pickedPageIdFromHref.value) return ''     // è già un link pagina -> mostra tree
  if (isProbablyUrl(s)) return ''               // è URL -> mostra tree
  return s                                      // testo -> ricerca titoli
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
  applyLink(`/pages/${pageId}`)
}

watch(
  () => props.open,
  async (v) => {
    if (!v) return
    await nextTick()
    urlInputEl.value?.focus()

    await pagePickerRef.value?.resetAndPrepare?.({
      revealPageId: pickedPageIdFromHref.value
    })
  },
  { immediate: true }
)

const footerAction = computed(() => ({
  iconId: 'lucide:globe',
  title: ({ hasQuery }: any) => {
    const s = (href.value ?? '').trim()
    return s ? s : 'Type a complete URL to link'
  },
  subtitle: () => 'Web page',
  disabled: () => !(href.value ?? '').trim(),
  onSelect: () => {
    const s = (href.value ?? '').trim()
    if (!s) return
    applyLink(s)
  },
}))
</script>

<template>
  <div v-if="open" 
  class="wrap" 
  :class="{ above: preferAbove }"
  :style="{ left: pos.x + 'px', top: pos.y + 'px' }">
    <div class="card"
    :style="{width: POPOVER_W + 'px', maxHeight: POPOVER_H + 'px'}">
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
<!--
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
        </div>-->
      </div>

      <div class="divider"></div>
      <div class="body">
      <PagePickerList
        ref="pagePickerRef"
        title=""
        :maxHeight="LIST_H - 40"
        :currentPageId="currentPageId ?? null"
        :query="pickerQuery"
        :enableSearch="false"
        :fetchIfEmpty="true"
        :footerAction="footerAction"
        @select="onPickPage"
      />
      </div>
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
.wrap.above{
  transform: translate(-50%, -100%);
}
.card{
  
  border-radius: 14px;
  background: var(--bg-menu, rgba(255,255,255,.94));
  border: 1px solid rgba(0,0,0,.10);
  box-shadow: 0 18px 50px rgba(0,0,0,.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;

}
.top{
  height: 40px;
  padding: 10px;
  flex: 0 0 auto;
}
.divider{ 
  flex: 0 0 auto;
   height: 1px;
  background: rgba(0,0,0,.08);
 }
.body{
  flex: 1 1 auto;         /* prende lo spazio rimanente */
  min-height: 0;          /* IMPORTANTISSIMO per far funzionare scroll nei figli */
  overflow: hidden;       /* lo scroll lo fa la lista dentro */
}
:deep(.page-picker){
  display: flex;
  flex: 1 1 auto;
  height: 100%;
  max-height: 120%;     /* toglie il vincolo “px only” */
  overflow-y: auto;
  min-height: 0;            /* prende tutto lo spazio disponibile */
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

</style>
