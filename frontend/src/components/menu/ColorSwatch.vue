<script setup lang="ts">
const props = defineProps({
  kind: { type: String as () => "text" | "bg", required: true },
  styleObj: { type: Object as () => Record<string, any>, default: () => ({}) },
});
</script>

<template>
  <span v-if="kind === 'text'" class="swatchText" :style="styleObj">A</span>
  <span v-else class="swatchBg" :style="styleObj"></span>
</template>

<style scoped>
.swatchText {
  width: 22px;
  height: 22px;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 13px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
}

.swatchBg {
  width: 22px;
  height: 22px;
  border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: transparent;
}
</style>
