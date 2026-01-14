// src/theme/colorsCatalog.js

export const DEFAULT_STYLE = { textColor: 'default', bgColor: 'default' }

// 1) Catalogo: token -> definizione
// Nota: i "value" qui NON vanno in DB; sono solo mapping.
export const COLOR_CATALOG = {
  text: {
    default: { label: 'Default', class: 'c-text-default' },
    gray:    { label: 'Gray',    class: 'c-text-gray' },
    brown:   { label: 'Brown',   class: 'c-text-brown' },
    orange:  { label: 'Orange',  class: 'c-text-orange' },
    yellow:  { label: 'Yellow',  class: 'c-text-yellow' },
    green:   { label: 'Green',   class: 'c-text-green' },
    blue:    { label: 'Blue',    class: 'c-text-blue' },
    purple:  { label: 'Purple',  class: 'c-text-purple' },
    pink:    { label: 'Pink',    class: 'c-text-pink' },
    red:     { label: 'Red',     class: 'c-text-red' },
  },

  bg: {
    default:   { label: 'Default', class: 'c-bg-default' },
    gray_bg:   { label: 'Gray',    class: 'c-bg-gray' },
    darkgray_bg:   { label: 'Dark Gray',    class: 'c-bg-darkgray' },
    brown_bg:  { label: 'Brown',   class: 'c-bg-brown' },
    orange_bg: { label: 'Orange',  class: 'c-bg-orange' },
    yellow_bg: { label: 'Yellow',  class: 'c-bg-yellow' },
    green_bg:  { label: 'Green',   class: 'c-bg-green' },
    blue_bg:   { label: 'Blue',    class: 'c-bg-blue' },
    purple_bg: { label: 'Purple',  class: 'c-bg-purple' },
    pink_bg:   { label: 'Pink',    class: 'c-bg-pink' },
    red_bg:    { label: 'Red',     class: 'c-bg-red' },
  },
}

// 2) Liste token (per UI)
export const TEXT_TOKENS = Object.keys(COLOR_CATALOG.text)
export const BG_TOKENS = Object.keys(COLOR_CATALOG.bg)

// 3) Validazione
export function isTextToken(t) {
  return typeof t === 'string' && t in COLOR_CATALOG.text
}
export function isBgToken(t) {
  return typeof t === 'string' && t in COLOR_CATALOG.bg
}
export function isKnownToken(t) {
  return isTextToken(t) || isBgToken(t)
}

// 4) Helpers label
export function labelForTextToken(t) {
  return COLOR_CATALOG.text[t]?.label ?? t
}
export function labelForBgToken(t) {
  return COLOR_CATALOG.bg[t]?.label ?? t
}

// 5) Normalizzazione props (merge default)
/*export function normalizeProps(rawProps) {
  const p = rawProps && typeof rawProps === 'object' ? rawProps : {}
  const style = p.style && typeof p.style === 'object' ? p.style : {}
  const textColor = isTextToken(style.textColor) ? style.textColor : DEFAULT_STYLE.textColor
  const bgColor = isBgToken(style.bgColor) ? style.bgColor : DEFAULT_STYLE.bgColor

  return {
    ...p,
    style: { ...DEFAULT_STYLE, ...style, textColor, bgColor },
  }
}*/
export function normalizeProps(rawProps) {
  const p = rawProps && typeof rawProps === 'object' ? rawProps : {}

  const styleRaw = p.style && typeof p.style === 'object' ? p.style : {}
  const textColor = isTextToken(styleRaw.textColor) ? styleRaw.textColor : DEFAULT_STYLE.textColor
  const bgColor = isBgToken(styleRaw.bgColor) ? styleRaw.bgColor : DEFAULT_STYLE.bgColor

  return {
    ...p, // ✅ preserva iconId, ecc.
    style: {
      ...DEFAULT_STYLE,
      ...styleRaw,
      textColor,
      bgColor,
    },
  }
}

export function classForTextToken(token) {
  return COLOR_CATALOG.text[token]?.class ?? COLOR_CATALOG.text.default.class
}
export function classForBgToken(token) {
  return COLOR_CATALOG.bg[token]?.class ?? COLOR_CATALOG.bg.default.class
}

export function styleForTextToken(token) {
  // se usi classi: ritorna un colore “reale” (var) solo per l’icona nel menu
  // esempio:
  if (token === 'default') return { color: 'rgba(255,255,255,.85)' }
  return { color: `var(--c-text-${token})` } // o mapping
}

export function styleForBgToken(token) {
  if (token === 'default') return { backgroundColor: 'transparent' }
  console.log("FROMcATALOG:",`var(--${COLOR_CATALOG.bg[token].class})`)
  return { backgroundColor: `var(--${COLOR_CATALOG.bg[token].class})` }
}