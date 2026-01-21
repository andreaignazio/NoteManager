import { computed, onMounted, onBeforeUnmount, ref, nextTick } from "vue"
import { storeToRefs } from "pinia"
import useUiStore from "@/stores/ui"

export function usePieMenuController({
  // state refs dal parent
  pieOpen, pieKind, pieMode, pieArea, pieX, pieY, pieContext,
  closePie,
  // refs ai componenti menu (template ref)
  mainMenuRef,
  colorMenuRef,
  highlightMenuRef,

  // applicazioni azioni (dispatcher)
  onAction,          // (id, ctx) => void|Promise
  onSetTextToken,    // (token, ctx) => void|Promise
  onSetBgToken,      // (token, ctx) => void|Promise
  onSetHighlightColor, // (color, ctx) => void|Promise
  // submenu policy
  dwellMs = 300,
  submenuIds = ["color"],     // estendibile
  dwellMoveToId = "moveTo",   // intent speciale

  backDwellMs = 500,
  backHoleRadius = 56,
}) {
  const ui = useUiStore()
  const { SidebarMoveToArmed, SidebarMoveToHoverPageId } = storeToRefs(ui)



  const activeApi = ref(null)

  function registerMenuApi(api) {
    activeApi.value = api
  }

  function unregisterMenuApi(api) {
    if (activeApi.value === api) {
      activeApi.value = null
    }
  }

  // stack: 'main' | 'color' | ...
  const stack = ref(["main"])
  const top = computed(() => stack.value.at(-1))

  const isDynamic = computed(() => pieKind.value === "dynamic")

  // dwell handling
  let dwellTimer = null
  let dwellLocked = false
  let lastHoverId = null

  let backDwellTimer = null

  function clearDwell() {
    if (dwellTimer) { clearTimeout(dwellTimer); dwellTimer = null }
  }

  function clearBackDwell() {
    if (backDwellTimer) { clearTimeout(backDwellTimer); backDwellTimer = null }
  }

  function resetStack() {
    stack.value = ["main"]
    dwellLocked = false
    lastHoverId = null
    clearDwell()
    clearBackDwell()
    SidebarMoveToArmed.value = false
    SidebarMoveToHoverPageId.value = null
    activeApi.value = null
  }

  function push(id) {
    if (top.value === id) return
    stack.value.push(id)
    dwellLocked = true // sticky finché non chiudi/esc/up
  }

  function getActiveCenter() {
    //console.log("getActiveCenter()", activeApi.value.getCenter())
    return activeApi.value?.getCenter?.() ?? activeApi.value?.getCenter?.() ?? null
  }


  // --- pointermove: aggiorna cursor nel menu top + dwell
  function onPointerMove(e) {
     //console.log("[PIE] move", e.clientX, e.clientY, "top=", top.value, "pieOpen", pieOpen.value)
    //console.log("SidebarArmed",SidebarMoveToArmed.value,"interactionScope", interactionScope.value )
     if (!pieOpen.value) return
    const api = activeApi.value
    if (!api) return
    api.setCursor?.(e.clientX, e.clientY)
    
    // moveTo tracking sidebar (se armato)
    if (SidebarMoveToArmed.value) {
      SidebarMoveToHoverPageId.value = pickPageIdAt(e.clientX, e.clientY)
      //console.log("[PIE] MoveTo Hover PageId:", SidebarMoveToHoverPageId.value)
      return
    }

    if (top.value !== "main") {
      console.log("not main dwell - go back")
      const c = getActiveCenter()
      //console.log("center:", c)
      if (c) {
        const dx = e.clientX - c.x
        const dy = e.clientY - c.y
        const d = Math.hypot(dx, dy)

        if (d < backHoleRadius) {
          if (!backDwellTimer) {
            backDwellTimer = setTimeout(() => {
              // torna al main (senza chiudere il pie)
              stack.value = ["main"]
              nextTick(() => {
              const main = 
              (typeof mainMenuRef === "function" ? mainMenuRef() : null)
              const c = main?.center?.value ?? main?.center
              if (c) main?.setCursor?.(c.x, c.y)
              main?.reset?.()

            })
              dwellLocked = false
              lastHoverId = null
              clearDwell()
              clearBackDwell()
            }, backDwellMs)
          }
        } else {
          clearBackDwell()
        }
      }
    }

    // dwell solo sul main e solo se non locked
    //if (top.value !== "main") return
    if (dwellLocked) return

    //const it = mainMenuRef.value?.getActiveItem?.()
    const it = api.getActiveItem?.()
    const hoverId = it?.id ?? null

    if (hoverId === lastHoverId) return
    lastHoverId = hoverId

    clearDwell()
    if (!hoverId) return

    const isSubmenu = submenuIds.includes(hoverId)
    const isMoveTo = hoverId === dwellMoveToId

    if (!isSubmenu && !isMoveTo) return

    dwellTimer = setTimeout(() => {
      dwellLocked = true

      if (isMoveTo) {
        SidebarMoveToArmed.value = true
        return
      }
      // submenu
      push(hoverId) // es: 'color'
    }, dwellMs)


  }

  // --- pointerup: commit top menu in dynamic OR commit moveTo
  async function onPointerUp(e) {
    const mods = { shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey }

    //console.log("[PIE] up", "pieOpen", pieOpen.value, "kind", pieKind.value, "isDynamic", isDynamic.value)

    if (!pieOpen.value) return
    if (!isDynamic.value) return

    // 1) se moveTo armed -> commit moveTo (come fai già)
    if (SidebarMoveToArmed.value) {
      await commitMoveTo()
      closePie()
      resetStack()
      return
    }

    // 2) commit del menu top
    const api = activeApi.value
    const res = api?.commit?.()

    if (!res) {
      closePie(); resetStack(); return
    }

    if (res.type === "close") {
      closePie(); resetStack(); return
    }

    // main: action generic
    if (res.type === "action") {
      await onAction?.(res.id, { ...(res.context ?? pieContext.value), mods })
      closePie(); resetStack(); return
    }

    // color
    if (res.type === "setText") {
      await onSetTextToken?.(res.token, { ...pieContext.value, mods })
      closePie(); resetStack(); return
    }
    if (res.type === "setBg") {
      await onSetBgToken?.(res.token, { ...pieContext.value, mods })
      closePie(); resetStack(); return
    }

    // highlight menu
    if (res.type === "setHighlight") {
       await onSetHighlightColor?.(res.color, { ...pieContext.value, mods })
        closePie(); resetStack(); return
    }
    closePie(); resetStack()
  }

  // --- pointerdown: solo per context (click sinistro conferma)
  async function onPointerDown(e) {
    const mods = { shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey }

    if (!pieOpen.value) return
    if (isDynamic.value) return
    if (e.button !== 0) return

    const api = activeApi.value
    api?.setCursor?.(e.clientX, e.clientY)
    const res = api?.commit?.()

    if (!res) return

    if (res.type === "action") {
      await onAction?.(res.id, { ...(res.context ?? pieContext.value), mods })
      closePie(); resetStack(); return
    }
    if (res.type === "setText") {
      await onSetTextToken?.(res.token, { ...pieContext.value, mods })
      closePie(); resetStack(); return
    }
    if (res.type === "setBg") {
      await onSetBgToken?.(res.token, { ...pieContext.value, mods })
      closePie(); resetStack(); return
    }
    if (res.type === "close") {
      closePie(); resetStack(); return
    }
    if (res.type === "setHighlight") {
      await onSetHighlightColor?.(res.color, { ...pieContext.value, mods })
      closePie(); resetStack(); return
    }

  }

  function onKeyDown(e) {
    if (!pieOpen.value) return
    if (e.key === "Escape") {
      closePie()
      resetStack()
    }
  }

  // --- helpers: page pick + moveTo commit
  /*function pickPageIdAt(x, y) {
    const el = document.elementFromPoint(x, y)
    return el?.closest?.("[data-page-id]")?.dataset?.pageId ?? null
  }*/
 function pickPageIdAt(x, y) {
  const els = document.elementsFromPoint(x, y)
  const el = els.find((n) => {
    if (!(n instanceof Element)) return false
    if (n.closest?.("[data-pie-overlay='true']")) return false
    if (n.closest?.("[data-pie-ui='true']")) return false
    return true
  })
  return el?.closest?.("[data-page-id]")?.dataset?.pageId ?? null
}

  async function commitMoveTo() {
    const targetPageId = SidebarMoveToHoverPageId.value
    SidebarMoveToArmed.value = false
    SidebarMoveToHoverPageId.value = null

    const blockId = pieContext.value?.blockId
    const fromPageId = blockId ? (/* blocksStore lookup outside */ null) : null

    // lascia al parent la logica di transfer: meglio in onAction
    // Qui puoi chiamare onAction con un id speciale:
    await onAction?.("moveToCommit", { ...pieContext.value, targetPageId })
  }

    const interactionScope = computed(() =>{
    console.log("USE PIE MENU CONTROLLER - interactionScope:", SidebarMoveToArmed.value ? 'global' : 'local')
    return SidebarMoveToArmed.value ? 'global' : 'local'
  }
)

  onMounted(() => {
    window.addEventListener("pointermove", onPointerMove, { passive: true, capture: true })
    window.addEventListener("pointerup", onPointerUp, true)
    window.addEventListener("pointerdown", onPointerDown, true)
    window.addEventListener("keydown", onKeyDown)
  })

  onBeforeUnmount(() => {
    window.removeEventListener("pointermove", onPointerMove,true)
    window.removeEventListener("pointerup", onPointerUp, true)
    window.removeEventListener("pointerdown", onPointerDown, true)
    window.removeEventListener("keydown", onKeyDown)
    clearDwell()
    clearBackDwell()
  })

  // quando chiudi pie: reset
  function onOpenChanged(v) {
    if (!v) resetStack()
    else resetStack()
  }

  return {
    stack,
    top,
    resetStack,
    onOpenChanged,
    registerMenuApi,
    unregisterMenuApi,
    interactionScope,
  }
}
