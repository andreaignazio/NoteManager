declare module "@/composables/useOverlayLayer" {
  import type { ComputedRef, Ref } from "vue";

  type OverlayLayer = {
    getMenuEl?: () => HTMLElement | null;
    getAnchorEl?: () => any;
    close?: () => void;
    options?: {
      closeOnEsc?: boolean;
      closeOnOutside?: boolean;
      stopPointerOutside?: boolean;
      lockScroll?: boolean;
      restoreFocus?: boolean;
      allowAnchorClick?: boolean;
    };
  };

  export function useOverlayLayer(
    idRefOrValue:
      | Ref<string | null>
      | ComputedRef<string | null>
      | string
      | null,
    getLayer: () => OverlayLayer,
  ): {
    isActive: ComputedRef<boolean>;
    register: (id: string) => void;
    unregister: (id: string) => void;
    syncOpen: (openRef: Ref<boolean> | ComputedRef<boolean>) => void;
  };
}
