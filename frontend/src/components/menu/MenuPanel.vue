<template>
  <div class="menu" role="menu">
    <ul class="menuList">
      <slot />
    </ul>
  </div>
</template>

<style scoped>
.menu {
  background: var(--bg-menu);
  border: 1.5px solid var(--border-menu);
  border-radius: 12px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.14);
  padding: 6px;
  color: var(--text-main);
}

.menuList {
  list-style: none;
  margin: 0;
  padding: 0;
}

.separator {
  height: 1px;
  margin: 6px 6px;
  background: var(--border-menu);
}

/* scrollbar identico */
.menu::-webkit-scrollbar {
  width: 13px;
}
.menu::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.18);
  border-radius: 10px;
  border: 3px solid transparent;
  background-clip: content-box;
}
.menu::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.26);
}
</style>
