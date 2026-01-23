import { nextTick, onUnmounted } from "vue";
import { useUIOverlayStore } from "@/stores/uioverlay";

export function useHostMenu<P extends object>(
  menuId: string,
  refEl: { value: any },
  payloadRef: { value: any },
  mapReqToPayload: (req: {
    menuId: string;
    anchorKey: string;
    payload?: any;
  }) => P | Promise<P>,
) {
  const uiOverlay = useUIOverlayStore();

  async function open(req: {
    menuId: string;
    anchorKey: string;
    payload?: any;
  }) {
    console.log("useHostMenu open", req);
    payloadRef.value = await mapReqToPayload(req);
    await nextTick();
    refEl.value?.open?.();
  }

  function close() {
    refEl.value?.close?.();
  }

  const unreg = uiOverlay.registerMenu({ menuId, open, close });
  onUnmounted(() => unreg?.());

  return { open, close };
}
