import { EditorView } from '@codemirror/view'
import { HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'

export function cmUiThemeFromVars(isDark) {
  return EditorView.theme({
    '&': {
      color: 'var(--text-main)',
      backgroundColor: 'transparent',
    },

    '&.cm-editor': { outline: 'none' },
    '&.cm-editor.cm-focused': { outline: 'none' },

    '.cm-content': {
      padding: '0px',
      caretColor: 'var(--text-main)',
    },

    '.cm-scroller': {
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      fontSize: '13px',
      lineHeight: '1.6',
      overflow: 'auto',
      background: 'transparent',
    },

    /* selection */
    '.cm-selectionBackground': { backgroundColor: 'var(--selection-bg)' },
    '&.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--selection-bg)' },

    /* active line (light touch) */
    '.cm-activeLine': { backgroundColor: 'var(--cm-line-bg)' },

    /* matching bracket */
    '.cm-matchingBracket': {
      backgroundColor: 'var(--cm-bracket-bg)',
      outline: '1px solid var(--cm-bracket-border)',
    },

    /* tooltip (autocomplete ecc) */
    '.cm-tooltip': {
      backgroundColor: 'var(--bg-secondary)',
      color: 'var(--text-main)',
      border: '1px solid var(--border-main)',
      borderRadius: '10px',
      boxShadow: '0 10px 30px rgba(0,0,0,.12)',
    },
  }, { dark: !!isDark })
}

export function cmHighlightStyleFromVars() {
  return HighlightStyle.define([
    { tag: tags.keyword, color: 'var(--cm-syntax-keyword)' },
    { tag: [tags.function(tags.variableName), tags.labelName], color: 'var(--cm-syntax-fn)' },
    { tag: [tags.variableName, tags.name], color: 'var(--cm-syntax-name)' },
    { tag: [tags.number], color: 'var(--cm-syntax-number)' },
    { tag: [tags.string, tags.special(tags.string)], color: 'var(--cm-syntax-string)' },
    { tag: tags.comment, color: 'var(--cm-syntax-comment)', fontStyle: 'italic' },
    { tag: [tags.typeName, tags.className], color: 'var(--cm-syntax-type)' },
    { tag: tags.meta, color: 'var(--cm-syntax-meta)' },
    { tag: tags.invalid, color: 'var(--cm-syntax-invalid)' },
  ])
}
