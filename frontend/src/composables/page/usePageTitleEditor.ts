import usePagesStore from '@/stores/pages'
import { computed, ref, watch } from 'vue'

export function usePageTitleEditor(pageId) {
  const pagesStore = usePagesStore()

  const titleDraft = ref('')
  const isEditing = ref(false)

  let titleTimer = null
  let titleOriginal = ''

  function syncFromStore() {
    const id = pageId.value
    if (!id) return
    titleDraft.value = pagesStore.pagesById[id]?.title ?? ''
  }

  // quando cambia pagina -> sync sempre
  watch(
    () => pageId.value,
    () => syncFromStore(),
    { immediate: true }
  )

  // quando cambia titolo nello store -> sync solo se NON sto editando
  watch(
    () => pagesStore.pagesById[pageId.value]?.title,
    () => {
      if (isEditing.value) return
      syncFromStore()
    },
    { immediate: true }
  )

  const isUntitled = computed(() => {
    const t = (titleDraft.value ?? '').trim()
    return t.length === 0 || t.toLowerCase() === 'untitled'
  })

  const titleValueForInput = computed(() => {
    const t = titleDraft.value ?? ''
    return isUntitled.value ? '' : t
  })

  function onTitleInput(e) {
    titleDraft.value = e.target.value
    if (titleTimer) clearTimeout(titleTimer)
    // ✅ salva “live” ma SENZA trim
    titleTimer = setTimeout(() => commitTitle({ trim: false }), 300)
  }

  async function commitTitle({ trim } = { trim: true }) {
    const id = pageId.value
    if (!id) return

    const raw = titleDraft.value ?? ''
    const nextTitle = trim ? raw.trim() : raw

    if ((pagesStore.pagesById[id]?.title ?? '') === nextTitle) return

    pagesStore.pagesById[id].title = nextTitle
    await pagesStore.patchPage(id, { title: nextTitle })
  }

  function onTitleFocus() {
    isEditing.value = true
    titleOriginal = titleDraft.value ?? ''
  }

  async function onTitleBlur() {
    isEditing.value = false
    if (titleTimer) clearTimeout(titleTimer)
    titleTimer = null
    // ✅ trim solo quando “finito”
    await commitTitle({ trim: true })
    // opzionale: riallinea da store dopo commit
    syncFromStore()
  }

  async function onTitleKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.currentTarget.blur()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      titleDraft.value = titleOriginal
      e.currentTarget.blur()
    }
  }

  function onTitleMouseDown() {}

  return {
    onTitleInput,
    isUntitled,
    onTitleMouseDown,
    onTitleFocus,
    onTitleBlur,
    onTitleKeydown,
    titleValueForInput,
  }
}
