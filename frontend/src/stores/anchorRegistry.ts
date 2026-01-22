import { defineStore } from "pinia";
import { shallowRef } from "vue";

type AnchorKey = string;

export type VirtualAnchor = { getBoundingClientRect: () => DOMRect };
export type AnchorLike = HTMLElement | VirtualAnchor;

type AnchorEntry = {
  el: AnchorLike;
  token: symbol;
  ts: number;
};

function normKey(key: string | number) {
  return String(key) as AnchorKey;
}

export const useAnchorRegistryStore = defineStore("anchorRegistry", () => {
  const registry = shallowRef<Map<AnchorKey, AnchorEntry>>(new Map());

  function registerAnchor(key: string | number, el: AnchorLike | null) {
    const id = normKey(key);

    if (!el) {
      const next = new Map(registry.value);
      next.delete(id);
      registry.value = next;
      return () => {};
    }

    const token = Symbol(`anchor:${id}`);
    const entry: AnchorEntry = { el, token, ts: Date.now() };

    const next = new Map(registry.value);
    next.set(id, entry);
    registry.value = next;

    return () => {
      const current = registry.value.get(id);
      if (current?.token !== token) return;
      const next2 = new Map(registry.value);
      next2.delete(id);
      registry.value = next2;
    };
  }

  // ora ritorna AnchorLike (HTMLElement o VirtualAnchor)
  function getAnchorEl(
    key: string | number | null | undefined,
  ): AnchorLike | null {
    if (key == null) return null;
    const entry = registry.value.get(normKey(key));
    return entry?.el ?? null;
  }

  function hasAnchor(key: string | number) {
    return registry.value.has(normKey(key));
  }

  return { registry, registerAnchor, getAnchorEl, hasAnchor };
});
