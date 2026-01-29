import { watch } from "vue";

export function useFocusRequestRouter(opts) {
  console.warn("[useFocusRequestRouter] deprecated (SingleDoc mode)");
  watch(
    () => null,
    () => {},
    { flush: "post" },
  );
}
