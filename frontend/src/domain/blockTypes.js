// src/domain/blockTypes.js
export const BLOCK_TYPES = [
  { type: 'p', label: 'Paragraph', description: 'Testo normale', icon: '¶' },
  { type: 'h1', label: 'Heading 1', description: 'Titolo grande', icon: 'H1' },
  { type: 'h2', label: 'Heading 2', description: 'Titolo medio', icon: 'H2' },
  { type: 'h3', label: 'Heading 3', description: 'Titolo piccolo', icon: 'H3' },
  { type: 'ul', label: 'Bulleted list', description: 'Elenco puntato', icon: '•' },
  { type: 'ol', label: 'Numbered list', description: 'Elenco numerato', icon: '1.' },
  { type: 'toggle', label: 'Toggle list', description: 'Elenco ripiegable', icon: '1.' }, //add chevron icon
  { type: 'todo', label: 'To-do', description: 'Checklist', icon: '☐' },
  { type: 'quote', label: 'Quote', description: 'Citazione', icon: '❝' },
  { type: 'code', label: 'Code', description: 'Blocco codice', icon: '</>' },
  { type: 'callout', label: 'Callout', description: 'Blocco codice', icon: '</>' },
  { type: 'divider', label: 'Divider', description: 'Separatore', icon: '—' },
]

export const DEFAULT_BLOCK_TYPE = 'p'
