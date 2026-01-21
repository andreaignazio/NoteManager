import usePagesStore  from "@/stores/pages"
import router from '@/router'
import { useUiStore } from '@/stores/ui'

export function usePageActions() {

    const pagesStore = usePagesStore()
    const ui = useUiStore()

    async function createChildAndActivate(parentId:string) {
        const newPageId = await pagesStore.addChildPage(parentId)

        pagesStore.ensureVisible(newPageId)

        pagesStore.requestTitleFocus(newPageId)

        pagesStore.openPage(newPageId)

        ui.setLastAddedPageId(newPageId)

        ui.requestScrollToPage(newPageId)

        router.push({ name: 'pageDetail', params: { id: newPageId } })
    }

    async function createPageAfterAndActivate(pageId:string) {
        const newPageId = await pagesStore.addPageAfterId(pageId)

        ui.setLastAddedPageId(newPageId)

        pagesStore.requestTitleFocus(newPageId)

        redirectToPage(newPageId)
    }

    async function redirectToPage(pageId:string) {
        pagesStore.ensureVisible(pageId)
        ui.requestScrollToPage(pageId)
        router.push({ name: 'pageDetail', params: { id: pageId } })
    }

    return {
        createChildAndActivate,
        redirectToPage,
        createPageAfterAndActivate
    }
}