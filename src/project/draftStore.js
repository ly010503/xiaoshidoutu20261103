const DATABASE = 'perler-local-drafts';
const STORE = 'drafts';
const INDEX_STORE = 'draftIndex';
const LEGACY_KEY = 'latest';
export const MAX_DRAFTS = 30;

export function createDraftId() {
  return `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 列表只需要的小摘要，避免打开“我的图纸”时把每份原图都读进内存。 */
export function summarizeDraft(id, draft) {
  const pattern = draft?.project?.pattern;
  return {
    id,
    name: draft?.name || '未命名图纸',
    updatedAt: draft?.updatedAt || null,
    thumbnail: typeof draft?.thumbnail === 'string' ? draft.thumbnail : '',
    width: pattern?.width || null,
    height: pattern?.height || null,
  };
}

export function sortDraftSummaries(summaries) {
  const time = (item) => new Date(item.updatedAt).getTime() || 0;
  return [...summaries].sort((first, second) => time(second) - time(first));
}

export function selectDraftsToPrune(summaries, limit = MAX_DRAFTS) {
  return sortDraftSummaries(summaries).slice(limit).map((item) => item.id);
}

function openDatabase() {
  if (!globalThis.indexedDB) throw new Error('此浏览器不支持本机草稿，请保存工程文件');
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 2);
    request.onupgradeneeded = (event) => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE);
      if (!database.objectStoreNames.contains(INDEX_STORE)) database.createObjectStore(INDEX_STORE);
      if (event.oldVersion >= 1) {
        // 旧版只保存一份固定键为 latest 的草稿，升级时转成带编号的普通图纸。
        const drafts = request.transaction.objectStore(STORE);
        const index = request.transaction.objectStore(INDEX_STORE);
        const legacy = drafts.get(LEGACY_KEY);
        legacy.onsuccess = () => {
          if (!legacy.result) return;
          const id = createDraftId();
          drafts.put({ ...legacy.result, id }, id);
          index.put(summarizeDraft(id, legacy.result), id);
          drafts.delete(LEGACY_KEY);
        };
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('请关闭其他旧版页面后重试草稿保存'));
  });
}

async function transaction(stores, mode, action) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = database.transaction(stores, mode);
      let result;
      Promise.resolve(action(tx, (value) => { result = value; })).catch(reject);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('草稿保存中断'));
    });
  } finally {
    database.close();
  }
}

const requestValue = (request, setResult) => { request.onsuccess = () => setResult(request.result); };

export const listDrafts = async () => sortDraftSummaries(await transaction([INDEX_STORE], 'readonly', (tx, setResult) => {
  requestValue(tx.objectStore(INDEX_STORE).getAll(), setResult);
}) || []);

export const readDraft = (id) => transaction([STORE], 'readonly', (tx, setResult) => {
  requestValue(tx.objectStore(STORE).get(id), setResult);
});

export async function writeDraft(id, draft) {
  if (!id) throw new Error('草稿编号缺失');
  await transaction([STORE, INDEX_STORE], 'readwrite', (tx) => {
    tx.objectStore(STORE).put({ ...draft, id }, id);
    tx.objectStore(INDEX_STORE).put(summarizeDraft(id, draft), id);
  });
  const stale = selectDraftsToPrune(await listDrafts());
  if (stale.length) await Promise.all(stale.map(deleteDraft));
}

export const deleteDraft = (id) => transaction([STORE, INDEX_STORE], 'readwrite', (tx) => {
  tx.objectStore(STORE).delete(id);
  tx.objectStore(INDEX_STORE).delete(id);
});
