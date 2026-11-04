import {
  createElement,
  FileText,
  FolderOpen,
  Save,
  Plus,
  Search,
  PanelLeft,
  File,
  Download,
  History,
  ExternalLink,
  Scissors,
  Copy,
  ClipboardPaste,
  Paintbrush,
  Pilcrow,
  CornerDownLeft,
  Grid2X2,
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  IndentIncrease,
  IndentDecrease,
  Table,
  Shapes,
  Image,
  SlidersHorizontal,
  Sigma,
  Link,
  PanelTop,
  PanelBottom,
  StickyNote,
  Columns2,
  ChevronLeft,
  ChevronRight,
  Undo2,
  Redo2,
  Bold,
  Italic,
  Underline,
  Scan,
  ZoomIn,
  Check,
  Trash2,
  type IconNode,
} from 'lucide';

const icons: Record<string, IconNode> = {
  document: FileText,
  folder: FolderOpen,
  save: Save,
  plus: Plus,
  search: Search,
  layout: PanelLeft,
  page: File,
  download: Download,
  history: History,
  external: ExternalLink,
  cut: Scissors,
  copy: Copy,
  paste: ClipboardPaste,
  brush: Paintbrush,
  paragraph: Pilcrow,
  return: CornerDownLeft,
  grid: Grid2X2,
  type: Type,
  align: AlignLeft,
  'align-center': AlignCenter,
  'align-right': AlignRight,
  list: List,
  numbered: ListOrdered,
  indent: IndentIncrease,
  outdent: IndentDecrease,
  table: Table,
  shape: Shapes,
  image: Image,
  settings: SlidersHorizontal,
  symbol: Sigma,
  link: Link,
  header: PanelTop,
  footer: PanelBottom,
  note: StickyNote,
  compare: Columns2,
  left: ChevronLeft,
  right: ChevronRight,
  undo: Undo2,
  redo: Redo2,
  bold: Bold,
  italic: Italic,
  underline: Underline,
  fit: Scan,
  zoom: ZoomIn,
  check: Check,
  trash: Trash2,
};

export function workspaceIcon(name: string): string {
  return createElement(icons[name] ?? FileText, {
    width: 20,
    height: 20,
    'stroke-width': 1.7,
    'aria-hidden': 'true',
    focusable: 'false',
  }).outerHTML;
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
