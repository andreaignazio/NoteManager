<script setup>
import { useAttrs } from 'vue'
import { posBetween } from '@/domain/position'; 
import DraggableList from '@/components/draggableList/DraggableList.vue';
/**
 * props:
 * - tree: array root nodes
 * emits:
 * - node-moved: payload finale per store/DB
 * - move-rejected: (opzionale) se vuoi debug UI
 */

defineOptions({ inheritAttrs: false })
const attrs = useAttrs()

const props = defineProps({
  tree: { type: Array, required: true },
  positionKey: { type: String, default: 'position' },
   allowInside: { type: Boolean, default: true },
   indent: {type:Number, default: 0},

   canDropInside: { type: Function, default: null },
})

const emit = defineEmits(['node-moved', 'move-rejected','addChildToggle'])

function canInside(draggedId, targetId) {
  if (!props.allowInside) return false
  if (!props.canDropInside) return true

  const dragged = findNodeAndParent(props.tree, draggedId)?.node ?? null
  const target = findNodeAndParent(props.tree, targetId)?.node ?? null

  return !!props.canDropInside({ dragged, target, draggedId, targetId })
}


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

  // anti-ciclo
  if (isDescendant(dragged.node, targetId)) return null

  const targetParentId = target.parent ? target.parent.id : null

  // ✅ siblings “virtuali” (senza il nodo trascinato)
  const sibs = (target.siblings ?? []).filter(
    (n) => String(n.id) !== String(draggedId)
  )

  // trova l’indice del target nella lista virtuale
  const tIndex = sibs.findIndex((n) => String(n.id) === String(targetId))
  if (tIndex === -1) return null

  const insertIndex = where === 'top' ? tIndex : tIndex + 1

  const prevItem = sibs[insertIndex - 1] ?? null
  const nextItem = sibs[insertIndex] ?? null

  const prevPos = prevItem?.[props.positionKey] ?? null
  const nextPos = nextItem?.[props.positionKey] ?? null

  // (opzionale ma consigliato) guard extra: se prev/next identici o “invertiti”, append/prepend safe
  if (prevPos != null && nextPos != null && String(prevPos) === String(nextPos)) {
    // prova append dopo prev
    const newPosition = posBetween(prevPos, null)
    return { id: draggedId, parentId: targetParentId, position: newPosition }
  }

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

  const prevPos = last?.[props.positionKey] ?? null
  const nextPos = null
  const newPosition = posBetween(prevPos, nextPos)

  return { id: draggedId, parentId: targetId, position: newPosition }
}

/**
 * Entry: chiamala quando ricevi intent-commit dalla UI
 */
function onIntentCommit({ draggedId, intent }) {
  if (!draggedId || !intent || intent.kind === 'none') return

  if (intent.kind === 'inside' && !canInside(draggedId, intent.targetId)) {
    emit('move-rejected', { draggedId, intent, reason: 'inside-not-allowed' })
    return
  }

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
  <DraggableList 
  v-bind="attrs"
  :items="tree"
  :allow-inside="allowInside"
  :indent = "indent"
  :can-drop-inside="canDropInside"
  @addChildToggle="(...args) => $emit('addChildToggle', ...args)"
   @intent-commit="onIntentCommit">
    <template #row="slotProps">
      <slot name="row" v-bind="slotProps" />
    </template>
  </DraggableList>
</template>
