import { computed } from "vue";

export function useBlockFocus(blockId) {
  console.warn("[useBlockFocus] deprecated (SingleDoc mode)");
  const isFocused = computed(() => false);
  const hasAnyFocus = computed(() => false);

  function onFocus() {}
  function onBlur() {}

  return { isFocused, hasAnyFocus, onFocus, onBlur };
}
