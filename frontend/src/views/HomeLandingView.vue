<script setup>
import { usePageActions } from "@/actions/pages.actions";
import { getIconComponent } from "@/icons/catalog";

const pageActions = usePageActions();

async function handleStartJourney() {
  try {
    await pageActions.createChildAndActivate(null);
  } catch (error) {
    console.warn("[HomeLandingView] create page failed", error);
  }
}
</script>

<template>
  <div class="home-landing">
    <div class="home-landing-card">
      <div class="home-landing-icon">
        <component :is="getIconComponent('lucide:home')" :size="28" />
      </div>
      <div class="home-landing-title">Welcome to NoteManager!</div>
      <button class="home-landing-cta" @click="handleStartJourney">
        <component :is="getIconComponent('lucide:edit-3')" :size="16" />
        Start your journey here
      </button>
    </div>
  </div>
</template>

<style scoped>
.home-landing {
  min-height: 60vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px 16px;
}

.home-landing-card {
  padding: 18px 20px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  background: var(--bg-menu);
  color: var(--text-main);
  border-radius: 18px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.18);
}

.home-landing-icon {
  width: 54px;
  height: 54px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-secondary);
}

.home-landing-title {
  text-align: center;
  font-size: 16px;
  font-weight: 600;
}

.home-landing-cta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 18px;
  border-radius: 999px;
  font-size: 14px;
  border: 0;
  cursor: pointer;
  background: var(--bg-hover);
  color: var(--text-main);
}

.home-landing-cta:hover {
  filter: brightness(1.05);
}
</style>
