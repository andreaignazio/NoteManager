<script setup lang="ts">
import LinkPopoverController from "@/components/LinkPopoverController.vue";

defineProps<{
  open: boolean;
  blockId: string | null;
  currentPageId?: string | null;
  anchorKey?: string | null;
  initialHref?: string | null;
}>();
</script>

<template>
  <LinkPopoverController v-bind="$props" />
</template>
