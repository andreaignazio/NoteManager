import { watchEffect, onBeforeUnmount } from 'vue'
import { useOverlayStore, type OverlayBinding } from '@/stores/overlay'

export function useOverlayBinding(binding: OverlayBinding) {
  const overlay = useOverlayStore()
  overlay.bind(binding)

  const stop = watchEffect(() => {
    // queste letture attivano la reattività
    binding.isOpen()
    binding.getInteractionScope?.()

    // sync open/close (grant/deny)
    overlay.sync(binding.id)

    // sync live fields quando montato
    overlay.syncLive(binding.id)
  })

  onBeforeUnmount(() => {
    stop()
    overlay.unbind(binding.id)
  })

  return {
    isTop: () => overlay.top?.id === binding.id,
    isMounted: () => overlay.has(binding.id),
  }
}