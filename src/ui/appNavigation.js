import { PAGES as PAGE_META, pageFromPath } from '../state/pages.js';

const SOURCE_PAGES = Object.fromEntries(
  Object.entries(PAGE_META).filter(([, meta]) => meta.heading).map(([id, meta]) => [id, meta.heading]),
);
const PAGES = new Set(Object.keys(PAGE_META));

/** Path navigation (/photo, /text …) keeps the current project alive while switching creation tools. */
export function createAppNavigation({ getState, onLeave, onText, onLibrary, onEditor }) {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  let page = 'home';

  function render() {
    const state = getState();
    const editing = page === 'editor';
    const hasPattern = Boolean(state.currentPattern);
    const source = SOURCE_PAGES[page];
    document.body.dataset.page = page;
    document.body.classList.toggle('editor-active', editing && hasPattern);
    $('#introSection').hidden = page !== 'home';
    $('#homeShowcase').hidden = page !== 'home';
    $('#homeStrengths').hidden = page !== 'home';
    $('#welcomeCard').hidden = false;
    $('#draftCard').hidden = page !== 'home' || !$('#restoreDraft').dataset.draftId;
    $('#creationHeading').hidden = !source && !(editing && !hasPattern);
    const heading = source || {
      eyebrow: '当前图纸', title: '调整一下，让图纸更合心意',
      description: '原图已准备好，选择尺寸与配色后生成图纸。',
    };
    $('#creationEyebrow').textContent = heading.eyebrow;
    $('#creationTitle').textContent = heading.title;
    $('#creationDescription').textContent = heading.description;
    $('#editorResume').hidden = !source || !state.image;
    $('.creator-layout').hidden = !source && !(editing && !hasPattern);
    $('.upload-card').hidden = !source;
    // The upload page starts a new project; the existing project has its own resume link.
    $('#uploadPrompt').hidden = false;
    $('#uploadedSummary').hidden = true;
    $('#settingsArea').hidden = !state.image;
    $('#sourceHome').hidden = editing ? !state.image : !source;
    $('#sourceGuide').hidden = !source;
    $('#sourceCard').hidden = !editing || !state.image;
    $('#resultSection').hidden = !editing || !hasPattern;
    $('#textPatternDialog').hidden = page !== 'text';
    $('#myPatternsDialog').hidden = page !== 'library';
    for (const panel of $$('[data-source-panel]')) panel.hidden = panel.dataset.sourcePanel !== page;
    for (const link of $$('[data-page-link]')) {
      if (link.dataset.pageLink === page) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
      if (link.dataset.pageLink === 'editor') link.hidden = !state.image;
    }
    $('#saveProjectButton').hidden = !editing;
    if (source) {
      $('#sourceGuideSteps').replaceChildren(...source.steps.map((text) => {
        const step = document.createElement('li');
        step.textContent = text;
        return step;
      }));
    }
  }

  function show(requestedPage, { replace = false, focus = false } = {}) {
    const next = PAGES.has(requestedPage) && (requestedPage !== 'editor' || getState().image)
      ? requestedPage : 'home';
    const changed = next !== page;
    if (changed) onLeave?.();
    page = next;
    const { path, title, description } = PAGE_META[page];
    if (location.pathname !== path || location.hash) history[replace ? 'replaceState' : 'pushState'](null, '', path);
    document.title = title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
    render();
    const activeLink = $(`[data-page-link="${page}"]`);
    const navigation = $('.navigation-inner');
    const bounds = navigation.getBoundingClientRect();
    const activeBounds = activeLink.getBoundingClientRect();
    if (activeBounds.right > bounds.right) navigation.scrollLeft += activeBounds.right - bounds.right + 12;
    else if (activeBounds.left < bounds.left) navigation.scrollLeft -= bounds.left - activeBounds.left + 12;
    if (changed || replace) {
      if (page === 'text') onText?.();
      if (page === 'library') onLibrary?.();
      if (page === 'editor') onEditor?.();
    }
    if (focus) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      const title = page === 'text' ? $('#textPageTitle') : page === 'library' ? $('#libraryPageTitle')
        : page === 'editor' && getState().currentPattern ? $('#editorPageTitle')
          : (SOURCE_PAGES[page] || page === 'editor') ? $('#creationTitle') : $('#introSection h2');
      if (title && !title.closest('[hidden]')) {
        title.setAttribute('tabindex', '-1');
        title.focus({ preventScroll: true });
      }
    }
  }

  function init() {
    $('#homeExample').append($('#welcomeCard'));
    $('.page-shell').append($('#textPatternDialog'), $('#myPatternsDialog'));
    document.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = event.target.closest('a[href^="/"]');
      const target = link && link.origin === location.origin ? pageFromPath(link.pathname) : null;
      if (!target) return;
      event.preventDefault();
      show(target, { focus: true });
    });
    // 旧版收藏的 #photo 这类地址自动换成对应路径。
    const currentPage = () => {
      const legacy = location.hash.slice(1);
      return PAGES.has(legacy) ? legacy : pageFromPath(location.pathname) || 'home';
    };
    window.addEventListener('popstate', () => show(currentPage(), { replace: true, focus: true }));
    show(currentPage(), { replace: true });
  }

  return { init, show, sync: render };
}
