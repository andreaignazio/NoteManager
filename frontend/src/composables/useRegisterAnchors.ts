// useRegisterAnchors.ts
import { watch, onUnmounted, type Ref } from 'vue'
import { useAnchorRegistryStore } from '@/stores/anchorRegistry'

export function useRegisterAnchors(spec: Record<string, Ref<HTMLElement | null>>) {
  const anchors = useAnchorRegistryStore()
  const unregByKey = new Map<string, () => void>()

  function setOne(key: string, el: HTMLElement | null) {
    unregByKey.get(key)?.()
    unregByKey.delete(key)
    if (el) unregByKey.set(key, anchors.registerAnchor(key, el))
  }

  watch(
    () => Object.values(spec).map(r => r.value),
    () => {
      for (const [key, elRef] of Object.entries(spec)) {
        setOne(key, elRef.value)
      }
    },
    { immediate: true }
  )

  onUnmounted(() => {
    for (const unreg of unregByKey.values()) unreg()
    unregByKey.clear()
  })
}
