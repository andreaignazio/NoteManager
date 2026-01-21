export function useUtilityActions() {

    async function copyToClipboard(text: string): Promise<boolean> {
        if (!text) return false

        // 1) API moderna (richiede HTTPS o localhost)
        if (navigator.clipboard && window.isSecureContext) {
            try {
            await navigator.clipboard.writeText(text)
            return true
            } catch (err) {
            // fallback sotto
            }
        }

        // 2) Fallback legacy
        try {
            const textarea = document.createElement('textarea')
            textarea.value = text

            // evita scroll / flicker
            textarea.style.position = 'fixed'
            textarea.style.left = '-9999px'
            textarea.style.top = '0'

            document.body.appendChild(textarea)
            textarea.focus()
            textarea.select()

            const ok = document.execCommand('copy')
            document.body.removeChild(textarea)

            return ok
        } catch {
            return false
        }
        }


        return {copyToClipboard,
    }
}
