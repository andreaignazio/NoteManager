export default {
  mounted(el, binding) {
    const ph = document.createElement('div')
    ph.className = 'ph-overlay'
    ph.textContent = binding.value.text || ''
    el.style.position ||= 'relative'
    el.appendChild(ph)
    el.__ph = ph

    update(ph, binding.value.show)
  },
  updated(el, binding) {
    if (!el.__ph) return
    el.__ph.textContent = binding.value.text || ''
    update(el.__ph, binding.value.show)
  },
  unmounted(el) {
    el.__ph?.remove()
  }
}

function update(el, show) {
  el.classList.toggle('ph-visible', !!show)
}
