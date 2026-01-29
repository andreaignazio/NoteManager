function debounce(fn, delay) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

export function useBlockPersistence(blockId, opts = {}) {
  const delay = opts.delay ?? 400;

  const save = debounce(async (payload) => {
    console.warn("[useBlockPersistence] deprecated (SingleDoc mode)");
  }, delay);

  function saveCode({ text, language, wrap }) {
    const payload = { text };
    if (language != null) payload.language = language;
    if (wrap != null) payload.wrap = wrap;
    return save(payload);
  }

  function saveRich(json, text) {
    return save({ json, text });
  }

  return { saveCode, saveRich };
}
