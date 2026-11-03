// Serialize writes so a slow old save can never overwrite a newer edit.
export function createAutoDraft({ capture, write, onStatus = () => {}, delay = 450 }) {
  let revision = 0;
  let savedRevision = 0;
  let timer;
  let running;

  async function flush() {
    clearTimeout(timer);
    if (running) return running;
    if (savedRevision === revision) return;
    running = (async () => {
      while (savedRevision !== revision) {
        const targetRevision = revision;
        onStatus('saving');
        try {
          const draft = await capture();
          if (draft) await write(draft);
          savedRevision = targetRevision;
          if (savedRevision === revision) onStatus('saved', draft?.updatedAt);
        } catch (error) {
          onStatus('error', error);
          break;
        }
      }
    })();
    try { await running; } finally { running = null; }
  }

  return {
    schedule() {
      revision += 1;
      clearTimeout(timer);
      onStatus('pending');
      timer = setTimeout(flush, delay);
    },
    flush,
    get pending() { return savedRevision !== revision; },
  };
}
