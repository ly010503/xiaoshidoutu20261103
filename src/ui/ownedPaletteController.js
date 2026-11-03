import { normalizeOwnedCodes, parseOwnedCodes } from '../color/ownedPalette.js';

const KEY = 'perler-owned-palettes-v1';

export function createOwnedPaletteController({ palette, state, onChange, notify }) {
  const $ = (id) => document.getElementById(id);
  const colors = palette.filter((color) => !color.manualOnly);
  const codes = colors.map((color) => color.code);
  let profiles = [];
  let selected = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    state.ownedColorCodes = normalizeOwnedCodes(saved.current?.codes, codes);
    state.useOwnedPalette = Boolean(saved.current?.enabled && state.ownedColorCodes.length);
    profiles = (Array.isArray(saved.profiles) ? saved.profiles : [])
      .filter((profile) => typeof profile?.name === 'string')
      .slice(0, 12).map((profile) => ({ name: profile.name.slice(0, 40), codes: normalizeOwnedCodes(profile.codes, codes) }));
  } catch { /* Unavailable storage does not prevent editing in this tab. */ }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ current: { enabled: state.useOwnedPalette, codes: state.ownedColorCodes }, profiles }));
      return true;
    } catch { notify('浏览器未能保存个人色板；当前页面仍可使用，工程文件会保留当前选择', 'error'); return false; }
  }

  function sync() {
    $('useOwnedPalette').checked = state.useOwnedPalette;
    $('ownedPaletteSummary').textContent = state.useOwnedPalette
      ? `已启用 ${state.ownedColorCodes.length} 个色号，生成和改色均使用这些颜色`
      : state.ownedColorCodes.length ? `已记住 ${state.ownedColorCodes.length} 色，当前未开启限制` : '未限制色号，使用完整 MARD 色库';
    document.querySelector('[data-color-style="ordered"] small').textContent = state.useOwnedPalette && !state.ownedColorCodes.includes('H7')
      ? '连续色块，轮廓使用已有色号中的深色，轮廓外自动留白'
      : '连续色块、H7外轮廓，轮廓外自动留白，更方便拼制';
  }

  function render() {
    const query = $('ownedColorSearch').value.trim().toUpperCase();
    const fragment = document.createDocumentFragment();
    for (const color of colors.filter((color) => `${color.code} ${color.name}`.toUpperCase().includes(query))) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'palette-swatch';
      button.dataset.code = color.code; button.setAttribute('role', 'checkbox');
      button.setAttribute('aria-label', `${color.code} ${color.name}`);
      button.setAttribute('aria-checked', String(selected.has(color.code)));
      const swatch = document.createElement('i'); swatch.style.backgroundColor = color.hex;
      const label = document.createElement('strong'); label.textContent = color.code;
      button.append(swatch, label); fragment.append(button);
    }
    $('ownedPaletteGrid').replaceChildren(fragment);
    $('ownedSelectedCount').textContent = `已选择 ${selected.size} / 221 色${selected.size ? '' : '，至少选择一个色号'}`;
    $('confirmOwnedPalette').disabled = !selected.size;
  }

  function renderProfiles() {
    const select = $('ownedProfileSelect');
    select.replaceChildren(new Option('选择已保存的色板', ''));
    profiles.forEach((profile, index) => select.append(new Option(`${profile.name}（${profile.codes.length}色）`, String(index))));
  }

  function open() {
    selected = new Set(state.ownedColorCodes);
    $('ownedColorSearch').value = ''; $('ownedCodesInput').value = ''; $('ownedProfileName').value = '';
    render(); renderProfiles(); $('ownedPaletteDialog').showModal();
  }

  $('openOwnedPalette').addEventListener('click', open);
  $('closeOwnedPalette').addEventListener('click', () => $('ownedPaletteDialog').close());
  $('useOwnedPalette').addEventListener('change', () => {
    if ($('useOwnedPalette').checked && !state.ownedColorCodes.length) {
      $('useOwnedPalette').checked = false; open(); return;
    }
    state.useOwnedPalette = $('useOwnedPalette').checked;
    sync(); persist(); onChange();
  });
  $('ownedColorSearch').addEventListener('input', render);
  $('ownedPaletteGrid').addEventListener('click', (event) => {
    const code = event.target.closest('[data-code]')?.dataset.code;
    if (!code) return;
    if (selected.has(code)) selected.delete(code); else selected.add(code);
    render();
  });
  $('selectAllOwned').addEventListener('click', () => { selected = new Set(codes); render(); });
  $('clearOwned').addEventListener('click', () => { selected.clear(); render(); });
  $('usePatternColors').addEventListener('click', () => {
    if (!state.statistics.length) return notify('请先生成一张图纸，再选择当前用色');
    selected = new Set(state.statistics.map((color) => color.code)); render();
  });
  $('applyOwnedCodes').addEventListener('click', () => {
    const result = parseOwnedCodes($('ownedCodesInput').value, codes);
    if (result.unknown.length) return notify(`未识别色号：${result.unknown.slice(0, 6).join('、')}，请检查后重试`, 'error');
    selected = new Set(result.codes); render();
  });
  $('saveOwnedProfile').addEventListener('click', () => {
    const name = $('ownedProfileName').value.trim().slice(0, 40);
    if (!name || !selected.size) return notify('请填写色板名称，并选择至少一个色号', 'error');
    profiles = [{ name, codes: [...selected] }, ...profiles.filter((profile) => profile.name !== name)].slice(0, 12);
    if (persist()) notify('个人色板已保存在当前浏览器', 'success');
    renderProfiles(); $('ownedProfileSelect').value = '0';
  });
  $('loadOwnedProfile').addEventListener('click', () => {
    const value = $('ownedProfileSelect').value;
    if (value === '' || !profiles[Number(value)]) return notify('请先选择一个已保存的色板');
    const profile = profiles[Number(value)]; selected = new Set(profile.codes);
    $('ownedProfileName').value = profile.name; $('ownedColorSearch').value = ''; render();
  });
  $('confirmOwnedPalette').addEventListener('click', () => {
    if (!selected.size) return;
    state.ownedColorCodes = [...selected]; state.useOwnedPalette = true;
    sync(); persist(); onChange(); $('ownedPaletteDialog').close();
    notify('已启用已有色号；重新生成后，图纸会按这些颜色配色', 'success', 4500);
  });
  sync();
  return { sync, open };
}
