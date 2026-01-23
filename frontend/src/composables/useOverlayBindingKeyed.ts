// composables/useOverlayBindingKeyed.ts
import { watchEffect, onBeforeUnmount } from "vue";
import { useOverlayStore, type OverlayBinding } from "@/stores/overlay";

/**
 * Binding overlay con:
 * - id statico (stabile)
 * - identityKey dinamica (quando cambia, rebind per resettare stato interno)
 */
export function useOverlayBindingKeyed(
  getBinding: () => OverlayBinding | null,
) {
  const overlay = useOverlayStore();

  let boundId: string | null = null;
  let boundIdentity: string | null | undefined = undefined;

  const stop = watchEffect(() => {
    const b = getBinding();
    if (!b?.id) return;

    const nextId = b.id;
    const nextIdentity = b.identityKey ?? null;

    const needRebind =
      boundId !== nextId ||
      boundIdentity !== nextIdentity ||
      !overlay.has(nextId);

    if (needRebind) {
      // cleanup vecchio
      if (boundId && overlay.has(boundId)) overlay.unbind(boundId);

      // bind nuovo
      overlay.bind(b);
      boundId = nextId;
      boundIdentity = nextIdentity;
    }

    // attiva reattività
    b.isOpen();
    b.getInteractionScope?.();

    // sync open/close (grant/deny)
    overlay.sync(nextId);

    // sync live fields
    overlay.syncLive(nextId);
  });

  onBeforeUnmount(() => {
    stop();
    if (boundId && overlay.has(boundId)) overlay.unbind(boundId);
  });

  return {
    isTop: () => overlay.top?.id === boundId,
    isMounted: () => (boundId ? overlay.has(boundId) : false),
  };
}
