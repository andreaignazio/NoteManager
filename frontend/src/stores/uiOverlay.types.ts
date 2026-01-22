// uiOverlay.types.ts
import type { Ref } from 'vue'

export type AnchorKey = string
export type MenuId = string

export type MaybeEl = HTMLElement | null
export type MaybeElRef = Ref<MaybeEl> | MaybeEl

export interface AnchorEntry {
  key: AnchorKey
  el: MaybeElRef
}

export interface OpenMenuRequest<TPayload = unknown> {
  menuId: MenuId
  anchorKey: AnchorKey
  payload?: TPayload
 
  
}
