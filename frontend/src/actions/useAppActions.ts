import { usePageActions } from './pages.actions'
import { useTextActions } from './text.actions'
// import { useBlockActions } from './blocks.actions'
// import { useOverlayActions } from './overlays.actions'

export function useAppActions() {
  const pages = usePageActions()
  const text = useTextActions()
  // const blocks = useBlockActions()
  // const overlays = useOverlayActions()

  return { pages, text/*, blocks, overlays*/ }
}

export default useAppActions