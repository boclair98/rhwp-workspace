// Original monochrome UI icons. Button IDs and command handlers stay unchanged.
const paths: Record<string, string> = {
  document: 'M6 3h8l4 4v14H6z M14 3v5h5 M9 12h6 M9 16h6',
  folder: 'M3 7h7l2 2h9v11H3z M3 7V4h7l2 3',
  save: 'M4 3h14l3 3v15H3V3z M7 3v6h10V3 M7 21v-8h10v8',
  plus: 'M12 5v14 M5 12h14',
  search: 'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  layout: 'M3 4h18v16H3z M9 4v16',
  page: 'M5 3h14v18H5z M9 7h6 M9 11h6 M9 15h4',
  download: 'M12 3v12 M7 10l5 5 5-5 M4 17v4h16v-4',
  history: 'M3 11a9 9 0 1 1 2 7 M3 4v7h7 M12 7v5l3 2',
  external: 'M14 3h7v7 M21 3L10 14 M10 4H4v16h16v-6',
  cut: 'M9 9l11 11 M9 15L20 4 M9 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  copy: 'M9 9h12v12H9z M15 5V3H3v12h2',
  paste: 'M9 4H5v17h14V4h-4 M9 2h6v5H9z M9 12h6 M9 16h6',
  brush: 'M15 3l6 6-9 9-6-6z M6 14l-3 7 7-3',
  paragraph: 'M15 3v18 M19 3v18 M19 3H9a5 5 0 0 0 0 10h6',
  return: 'M20 5v9H4 M9 9l-5 5 5 5',
  grid: 'M3 3h18v18H3z M9 3v18 M15 3v18 M3 9h18 M3 15h18',
  type: 'M5 20L12 3l7 17 M8 14h8',
  align: 'M4 5h16 M4 10h10 M4 15h16 M4 20h10',
  list: 'M9 5h12 M9 12h12 M9 19h12 M3 5h1 M3 12h1 M3 19h1',
  numbered:
    'M9 5h12 M9 12h12 M9 19h12 M3 3h1v4 M3 7h2 M3 10c3-2 3 1 0 3h3 M3 17h2l-2 2h2v2H3',
  indent: 'M10 4h11 M10 9h11 M10 14h11 M10 19h11 M3 8l4 4-4 4',
  outdent: 'M10 4h11 M10 9h11 M10 14h11 M10 19h11 M7 8l-4 4 4 4',
  table: 'M3 4h18v16H3z M3 10h18 M9 4v16 M15 10v10',
  shape: 'M3 3h10v10H3z M16 10a6 6 0 1 1-6 6',
  image: 'M3 4h18v16H3z M3 16l5-5 5 5 3-3 5 5 M15 8h1',
  settings: 'M4 7h16 M4 17h16 M8 4v6 M16 14v6',
  symbol: 'M5 4h14l-8 8 8 8H5',
  link: 'M10 14l4-4 M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0 M16 8l1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0',
  header: 'M5 3h14v18H5z M5 8h14 M9 5h6',
  footer: 'M5 3h14v18H5z M5 16h14 M9 19h6',
  note: 'M5 3h14v18H5z M8 7h8 M8 11h8 M8 17h4',
  compare: 'M3 4h7v16H3z M14 4h7v16h-7z M6 8h1 M17 8h1',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
};

export function workspaceIcon(name: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] ?? paths.document}"/></svg>`;
}

export function installWorkspaceToolbarIcons(): void {
  const commands: Record<string, string> = {
    'edit:format-copy': 'brush',
    'view:ctrl-mark': 'paragraph',
    'view:para-mark': 'return',
    'view:toggle-grid': 'grid',
    'format:char-shape': 'type',
    'format:para-shape': 'align',
    'format:toggle-numbering': 'numbered',
    'format:level-increase': 'indent',
    'format:level-decrease': 'outdent',
    'table:create': 'table',
    'insert:shape': 'shape',
    'insert:image': 'image',
    'format:object-properties': 'settings',
    'insert:symbols': 'symbol',
    'insert:hyperlink': 'link',
    'page:header-create': 'header',
    'page:footer-create': 'footer',
    'insert:footnote': 'note',
    'insert:endnote': 'note',
    'edit:find': 'search',
    'edit:document-history': 'history',
    'edit:compare-documents': 'compare',
  };
  document
    .querySelectorAll<HTMLButtonElement>('#icon-toolbar .tb-btn')
    .forEach((button) => {
      let name = commands[button.dataset.cmd ?? ''];
      if (button.querySelector('.icon-cut')) name = 'cut';
      if (button.querySelector('.icon-copy')) name = 'copy';
      if (button.querySelector('.icon-paste')) name = 'paste';
      if (button.id === 'tb-bullet') name = 'list';
      const previous = button.querySelector('.tb-sprite,.tb-icon-text');
      if (!name || !previous) return;
      const visual = document.createElement('span');
      visual.className = 'workspace-tool-icon';
      visual.setAttribute('aria-hidden', 'true');
      visual.innerHTML = workspaceIcon(name);
      previous.replaceWith(visual);
    });
  for (const [id, name] of [
    ['icon-toolbar-prev', 'left'],
    ['icon-toolbar-next', 'right'],
  ]) {
    const target = document.querySelector(`#${id} .tb-scroll-nav-icon`);
    if (target) target.innerHTML = workspaceIcon(name);
  }
}
