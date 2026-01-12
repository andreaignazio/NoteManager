<script setup>

</script>

<template>

    <ul>
        <li
        v-for="page in pages"
        :key="page.id"
        @click="openPage(page.id)"
        class="page-item"
        >
        {{ page.title }}
        </li>
    </ul>

</template>

<style scoped>

</style>