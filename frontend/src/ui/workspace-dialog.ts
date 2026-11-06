export function workspaceDialog(title: string, returnFocus?: HTMLElement) {
  const previous =
    returnFocus ?? (document.activeElement as HTMLElement | null);
  const dialog = document.createElement('dialog');
  dialog.className = 'workspace-dialog modal-overlay';
  const heading = document.createElement('header');
  heading.className = 'workspace-dialog-header';
  const label = document.createElement('h2');
  label.textContent = title;
  label.id = `workspace-dialog-${crypto.randomUUID()}`;
  dialog.setAttribute('aria-labelledby', label.id);
  const close = () => dialog.close();
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'workspace-button';
  closeButton.textContent = '닫기';
  closeButton.setAttribute('aria-label', `${title} 닫기`);
  closeButton.addEventListener('click', close);
  heading.append(label, closeButton);
  const body = document.createElement('div');
  body.className = 'workspace-dialog-body';
  const footer = document.createElement('footer');
  footer.className = 'workspace-dialog-footer';
  dialog.append(heading, body, footer);
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      const targets = [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,a[href],[tabindex]:not([tabindex="-1"])',
        ),
      ].filter((node) => node.getClientRects().length > 0);
      const first = targets[0],
        last = targets.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    event.stopPropagation();
  });
  dialog.addEventListener(
    'close',
    () => {
      dialog.remove();
      (previous?.getClientRects().length
        ? previous
        : document.getElementById('workspace-nav-toggle')
      )?.focus();
    },
    { once: true },
  );
  document.body.append(dialog);
  dialog.showModal();
  return { dialog, body, footer, close };
}
