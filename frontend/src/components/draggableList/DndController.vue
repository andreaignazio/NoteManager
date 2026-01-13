<script setup>
import { posBetween } from '@/domain/position'; 
import DraggableList from '@/components/draggableList/DraggableList.vue';
/**
 * props:
 * - tree: array root nodes
 * emits:
 * - node-moved: payload finale per store/DB
 * - move-rejected: (opzionale) se vuoi debug UI
 */
const props = defineProps({
  tree: { type: Array, required: true },
})

const emit = defineEmits(['node-moved', 'move-rejected'])

// ---- util: posBetween (stub) ----
// Sostituisci con la tua implementazione reale (LexoRank / fraction / ecc.)
/*function posBetween(prev, next) {
  // placeholder: se hai già questa funzione altrove, importala
  if (prev == null && next == null) return 'm'
  if (prev == null) return `_${next}`
  if (next == null) return `${prev}_`
  return `${prev}|${next}`
}*/

function findNodeAndParent(tree, id) {
  const stack = [{ parent: null, children: tree }]
  while (stack.length) {
    const { parent, children } = stack.pop()
    for (let i = 0; i < children.length; i++) {
      const n = children[i]
      if (String(n.id) === String(id)) {
        return { node: n, parent, siblings: children, index: i }
      }
      if (n.children?.length) stack.push({ parent: n, children: n.children })
    }
  }
  return null
}

function isDescendant(node, maybeDescId) {
  if (!node?.children?.length) return false
  const stack = [...node.children]
  while (stack.length) {
    const n = stack.pop()
    if (String(n.id) === String(maybeDescId)) return true
    if (n.children?.length) stack.push(...n.children)
  }
  return false
}

function computeReorderPayload(tree, draggedId, targetId, where) {
  const dragged = findNodeAndParent(tree, draggedId)
  const target = findNodeAndParent(tree, targetId)
  if (!dragged || !target) return null

  // anti-ciclo: non puoi muovere dentro un tuo discendente
  if (isDescendant(dragged.node, targetId)) return null

  const targetParentId = target.parent ? target.parent.id : null
  const siblings = target.siblings

  // index “logico” rispetto al target
  const insertIndex = where === 'top' ? target.index : target.index + 1

  const prevItem = siblings[insertIndex - 1] ?? null
  const nextItem = siblings[insertIndex] ?? null

  const prevPos = prevItem?.position ?? null
  const nextPos = nextItem?.position ?? null
  const newPosition = posBetween(prevPos, nextPos)

  return { id: draggedId, parentId: targetParentId, position: newPosition }
}

function computeInsidePayload(tree, draggedId, targetId) {
  const dragged = findNodeAndParent(tree, draggedId)
  const target = findNodeAndParent(tree, targetId)
  if (!dragged || !target) return null

  if (String(draggedId) === String(targetId)) return null
  if (isDescendant(dragged.node, targetId)) return null

  // append: ultimo figlio del target
  const children = target.node.children ?? []
  const last = children[children.length - 1] ?? null

  const prevPos = last?.position ?? null
  const nextPos = null
  const newPosition = posBetween(prevPos, nextPos)

  return { id: draggedId, parentId: targetId, position: newPosition }
}

/**
 * Entry: chiamala quando ricevi intent-commit dalla UI
 */
function onIntentCommit({ draggedId, intent }) {
  if (!draggedId || !intent || intent.kind === 'none') return

  let payload = null

  if (intent.kind === 'line') {
    payload = computeReorderPayload(props.tree, draggedId, intent.targetId, intent.where)
  } else if (intent.kind === 'inside') {
    payload = computeInsidePayload(props.tree, draggedId, intent.targetId)
  }

  if (!payload) {
    emit('move-rejected', { draggedId, intent, reason: 'invalid-or-cycle' })
    return
  }

  emit('node-moved', payload)
}
</script>

<template>
  <!-- wrapper “controller”: renderizza la UI e intercetta intent -->
  <DraggableList :items="tree" @intent-commit="onIntentCommit">
    <template #row="slotProps">
      <slot name="row" v-bind="slotProps" />
    </template>
  </DraggableList>
</template>
