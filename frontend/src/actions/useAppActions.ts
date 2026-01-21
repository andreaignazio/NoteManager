import { usePageActions } from './pages.actions'
// import { useBlockActions } from './blocks.actions'
// import { useOverlayActions } from './overlays.actions'

export function useAppActions() {
  const pages = usePageActions()
  // const blocks = useBlockActions()
  // const overlays = useOverlayActions()

  return { pages /*, blocks, overlays*/ }
}

export default useAppActions