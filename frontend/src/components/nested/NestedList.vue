<script setup>
    import { storeToRefs } from 'pinia'
    import usePagesStore from '@/stores/pages'
    import { onMounted, computed, ref, watch } from 'vue'
    import NestedWrapper from './NestedWrapper.vue'


    const pagesStore = usePagesStore()

    const {childrenByParentId} = storeToRefs(pagesStore)

    const KEY_ROOT = 'root'
    
    const tree = ref([])

    function buildForest(childrenByParentId) {
        // 1) trova tutte le root
        const allParents = Object.keys(childrenByParentId)
        const allChildren = new Set(
            Object.values(childrenByParentId).flat()
        )

        const roots = allParents.filter(id => !allChildren.has(id))

        // 2) builder ricorsivo
        function buildNode(id) {
            const childIds = childrenByParentId[id] ?? []

            return {
            id,
            children: childIds.map(childId => buildNode(childId))
            }
        }

        // 3) ritorna la forest
        return roots.map(rootId => buildNode(rootId))
        }

    watch(childrenByParentId, (newVal)=>{
        tree.value = buildForest(newVal)
    }, {immediate: true, deep: true})

    const handleTreeUpdate = (newTree) => {
        tree.value = newTree;
    }

    //const tree = computed(()=>buildForest(childrenByParentId.value))

    onMounted(pagesStore.fetchPages)

</script>
<template>
   <!-- <button @click="test">Test</button>-->

    <NestedWrapper 
    v-model:list="tree"
    parentId="root"
    @update:list="handleTreeUpdate"
    />


</template>
<style scoped>
    /*body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  color: #37352f;
  margin: 0;
  padding: 40px;
}*/
.notion-page {
  max-width: 700px;
  margin: 0 auto;
}
.debug {
  background: #f0f0f0;
  padding: 20px;
  border-radius: 8px;
  font-size: 12px;
}
</style>