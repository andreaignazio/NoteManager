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
      
        if (prevId && prevId !== id) unregister(prevId)
        if (!id) return

        if (open) register(id)
        else unregister(id)
      },
      { immediate: true }
    )
  }

  onBeforeUnmount(() => {
    unregister(idRef.value)
  })

  return { isActive, register, unregister, syncOpen }
}