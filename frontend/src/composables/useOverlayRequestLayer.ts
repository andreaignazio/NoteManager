// composables/useOverlayRequestLayer.ts
import { computed, watch, unref, onBeforeUnmount } from 'vue'
import { useOverlayStore, type OverlayLayer } from '@/stores/overlay'

export function useOverlayRequestLayer(
  idRefOrValue: any,
  getLayer: () => Omit<OverlayLayer, 'id'>,
) {
  const overlay = useOverlayStore()
  const idRef = computed(() => unref(idRefOrValue))

  const isTop = computed(() => overlay.top?.id === idRef.value)
  const isMounted = computed(() => overlay.has(idRef.value))

  function open() {
    const id = idRef.value
    if (!id) return null
    return overlay.request({ id, ...getLayer() })
  }

  function update(patch?: Partial<OverlayLayer>) {
    const id = idRef.value
    if (!id) return
    overlay.update(id, { id, ...getLayer(), ...(patch || {}) })
  }

  function close(mode: 'close' | 'remove' = 'remove') {
    const id = idRef.value
    if (!id) return
    if (mode === 'close') overlay.close(id)
    else overlay.remove(id)
  }

  // utile per hover: openRef + updateOnRef
  function sync(openRef: any, updateDepsRef?: any) {
    watch(
      () => unref(openRef),
      (open) => {
        if (open) open()
        else close('remove')
      },
      { immediate: true }
    )

    if (updateDepsRef) {
      watch(
        () => unref(updateDepsRef),
        () => {
          if (isMounted.value) update()
        },
        { deep: true }
      )
    }
  }

  onBeforeUnmount(() => close('remove'))

  return { isTop, isMounted, open, update, close, sync }
}
