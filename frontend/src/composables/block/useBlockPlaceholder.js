import { computed, ref } from 'vue'

export function useBlockPlaceholder(ctx) {
  const tiptapText = ref('')

  function syncTiptapText(ed) {
    tiptapText.value = (ed?.getText?.() ?? '').trim()
  }

  const isEmpty = computed(() => {
    if (ctx.typeClass?.value  === 'code') return (ctx.localTextContent.value ?? '').trim().length === 0
    if (ctx.editor?.value) return tiptapText.value.length === 0
    return (ctx.localTextContent.value ?? '').trim().length === 0
  })

  const placeholderText = computed(() => {
    if (ctx.typeClass?.value  === 'callout') return 'Callout…'
    if (ctx.typeClass?.value === 'todo') return 'To-do…'
    if (ctx.typeClass?.value === 'ol') return 'List item…'
    if (ctx.typeClass?.value === 'ul') return 'List item…'
    if (ctx.typeClass?.value === 'quote') return 'Quote…'
    if (ctx.typeClass?.value === 'h1') return 'Heading 1'
    if (ctx.typeClass?.value === 'h2') return 'Heading 2'
    if (ctx.typeClass?.value === 'h3') return 'Heading 3'
    if (ctx.isCode?.value) return 'Type code…'
    return 'Type / for commands'
  })

  const showPlaceholder = computed(() => {
    if (!isEmpty.value) return false
    return !!ctx.isFocused?.value
  })

  return { tiptapText, syncTiptapText, isEmpty, placeholderText, showPlaceholder }
}
