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

    async function duplicatePage(pageId:string) {
        const newId = await pagesStore.duplicatePageTransactional(pageId)
        ui.setLastAddedPageId(newId)
        redirectToPage(newId)
    }

    async function toggleFavoritePage(pageId:string) {
        await pagesStore.toggleFavoritePage(pageId)
        ui.setLastAddedPageId(pageId)
    }

    async function deletePage(pageId:string) {

        const hasChildren = pagesStore.hasChildren?.(pageId) ??
            ((pagesStore.childrenByParentId?.[String(pageId)] ?? []).length > 0)
        const id = pageId
        if (!id) return
        
        try {
            const nextId = pagesStore.getNextPageIdAfterDelete?.(id)

            if (hasChildren.value && keepChildren.value) {
            try {
                await pagesStore.reparentChildrenToParent(id)
            } catch (e) {
                console.error('[PageActions] reparentChildrenToParent failed', e)
                throw e
            }
            }

            try {
            await pagesStore.deletePage(id)
            } catch (e) {
            console.error('[PageActions] deletePage failed', e)
            throw e
            }


            if (nextId) router.push({ name: 'pageDetail', params: { id: nextId } })
            else router.push('/')
        } catch (e) {
            console.error('[PageActions] DELETE FLOW FAILED', e)
        } finally {
            console.groupEnd()
        }
        }

    return {
        createChildAndActivate,
        redirectToPage,
        createPageAfterAndActivate,
        duplicatePage,
        toggleFavoritePage,
        deletePage
    }
}