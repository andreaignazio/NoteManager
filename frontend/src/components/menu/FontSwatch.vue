<script setup lang="ts">
import { computed } from "vue";
import { fontCssFamily } from "@/domain/fontCatalog"; // path tuo

const props = defineProps({
  token: { type: String, required: true },
});

const styleObj = computed(() => ({
  fontFamily: fontCssFamily(props.token),
}));
</script>

<template>
  <span class="swFont" :style="styleObj">Aa</span>
</template>

<style scoped>
.swFont {
  width: 22px;
  height: 22px;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  font-weight: 700;
  font-size: 13px;

  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.85);
}
</style>
