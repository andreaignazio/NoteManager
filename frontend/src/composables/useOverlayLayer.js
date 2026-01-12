
/*import { computed, watch, unref } from 'vue'
import { useOverlayStore } from '@/stores/overlay'

export function useOverlayLayer(idRefOrValue, getLayer) {
  const overlay = useOverlayStore()

  const idRef = computed(() => unref(idRefOrValue))

  const isActive = computed(() => overlay.top?.id === idRef.value)

  function register() {
    const id = idRef.value
    if (!id) return
    console.log("REGISTERD:", id)
    overlay.open({ id, ...getLayer() })
  }

  function unregister() {
    const id = idRef.value
    if (!id) return
    console.log("unREGISTERD:", id)
    overlay.remove(id) // IMPORTANT: remove, non close
  }

  function syncOpen(openRef) {
    watch(
      [idRef, () => unref(openRef)],
      ([id, open], [prevId]) => {
        // se cambia id mentre era open, deregistra il precedente
        if (prevId && prevId !== id) overlay.remove(prevId)

        if (!id) return
        if (open) register()
        else unregister()
      },
      { immediate: true }
    )
  }

  return { isActive, register, unregister, syncOpen }
}*/
import { computed, watch, unref, onBeforeUnmount } from 'vue'
import { useOverlayStore } from '@/stores/overlay'

export function useOverlayLayer(idRefOrValue, getLayer) {
  const overlay = useOverlayStore()
  const idRef = computed(() => unref(idRefOrValue))
  const isActive = computed(() => overlay.top?.id === idRef.value)

  function register(id) {
    if (!id) return
    overlay.open({ id, ...getLayer() })
  }

  function unregister(id) {
    if (!id) return
    overlay.remove(id) // remove, non close
  }

  function syncOpen(openRef) {
    watch(
      [() => idRef.value, () => unref(openRef)],
      ([id, open], [prevId, prevOpen]) => {
        // se l'id cambia, pulisci sempre il precedente
        if (prevId && prevId !== id) unregister(prevId)

        // se non ho id nuovo, stop (ma prevId l’ho già pulito sopra)
        if (!id) return

        if (open) register(id)
        else unregister(id)
      },
      { immediate: true }
    )
  }

  // safety: se il componente muore, rimuovi l'id corrente
  onBeforeUnmount(() => {
    unregister(idRef.value)
  })

  return { isActive, register, unregister, syncOpen }
}