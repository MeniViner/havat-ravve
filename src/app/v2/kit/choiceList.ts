// Keep the select as the form control. The menu reads its current options on every
// opening and sends the usual change event, including for a controlled React select.
function fieldName(select: HTMLSelectElement) {
  const direct = select.getAttribute('aria-label');
  if (direct) return direct;
  const references = (select.getAttribute('aria-labelledby') || '').split(/\s+/);
  const named = references.map(id => document.getElementById(id)?.textContent?.trim()).filter(Boolean).join(' ');
  if (named) return named;
  const label = select.labels?.[0]?.cloneNode(true) as HTMLElement | undefined;
  label?.querySelectorAll('select, input, button').forEach(node => node.remove());
  return label?.textContent?.trim() || select.title || 'בחירה';
}

function openChoiceList(select: HTMLSelectElement, keyboard = false) {
  const dialog = document.createElement('dialog');
  const list = document.createElement('div');
  const title = fieldName(select);
  dialog.className = 'farm-choice-menu';
  dialog.toggleAttribute('data-keyboard', keyboard);
  dialog.dir = getComputedStyle(select).direction;
  dialog.setAttribute('aria-label', title);
  list.id = 'farm-choice-options';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', title);
  dialog.append(list);
  // Stay within the active sheet's accessibility tree and inherit its colour scheme.
  (select.closest('dialog, [role="dialog"], .v2') || document.body).append(dialog);
  const lifetime = new AbortController();
  const { signal } = lifetime;
  const options = new Map<HTMLOptionElement, HTMLElement>();
  let active: HTMLOptionElement | undefined;
  let search = '', lastKey = 0;

  function position() {
    const rect = select.getBoundingClientRect();
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
    const width = viewport?.width || document.documentElement.clientWidth;
    const height = viewport?.height || document.documentElement.clientHeight;
    if (!rect.width || !rect.height || rect.bottom <= top || rect.top >= top + height) {
      close();
      return;
    }
    const availableBelow = top + height - rect.bottom - 12;
    const availableAbove = rect.top - top - 12;
    const below = availableBelow >= Math.min(250, list.scrollHeight + 12) || availableBelow >= availableAbove;
    const menuWidth = Math.min(width - 16, Math.max(190, rect.width));
    const desiredLeft = dialog.dir === 'rtl' ? rect.right - menuWidth : rect.left;
    dialog.style.width = menuWidth + 'px';
    dialog.style.left = Math.max(left + 8, Math.min(left + width - menuWidth - 8, desiredLeft)) + 'px';
    dialog.style.maxHeight = Math.max(44, Math.min(320, below ? availableBelow : availableAbove)) + 'px';
    dialog.style.top = Math.max(top + 8, below ? rect.bottom + 4 : rect.top - dialog.offsetHeight - 4) + 'px';
  }

  function close() {
    lifetime.abort();
    optionChanges.disconnect();
    removal.disconnect();
    select.removeAttribute('aria-controls');
    select.removeAttribute('aria-expanded');
    if (dialog.open) dialog.close();
    dialog.remove();
    if (select.isConnected && !select.matches(':disabled') && select.getClientRects().length) select.focus({ preventScroll: true });
  }

  function highlight(option?: HTMLOptionElement) {
    const row = option && options.get(option);
    if (!row) return;
    active = option;
    row.focus({ preventScroll: true });
    const here = row.getBoundingClientRect(), bounds = dialog.getBoundingClientRect();
    if (here.top < bounds.top + 4) dialog.scrollTop -= bounds.top + 4 - here.top;
    if (here.bottom > bounds.bottom - 4) dialog.scrollTop += here.bottom - bounds.bottom + 4;
  }

  function choose(option: HTMLOptionElement) {
    if (!select.isConnected || select.matches(':disabled') || option.closest('select') !== select || option.matches(':disabled')) return;
    const changed = select.selectedIndex !== option.index;
    close();
    if (!changed) return;
    select.selectedIndex = option.index;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function draw() {
    options.clear();
    list.replaceChildren();
    let group: HTMLOptGroupElement | null = null;
    let parent = list;
    for (const option of select.options) {
      if (option.hidden || option.parentElement?.hidden) continue;
      const nextGroup = option.closest('optgroup');
      if (group !== nextGroup) {
        group = nextGroup;
        parent = list;
        if (group) {
          parent = document.createElement('div');
          parent.setAttribute('role', 'group');
          parent.setAttribute('aria-label', group.label);
          const heading = document.createElement('div');
          heading.className = 'farm-choice-group';
          heading.setAttribute('aria-hidden', 'true');
          heading.textContent = group.label;
          parent.append(heading);
          list.append(parent);
        }
      }
      const row = document.createElement('div');
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(option.selected));
      row.tabIndex = -1;
      row.textContent = option.label;
      if (option.disabled || group?.disabled) row.setAttribute('aria-disabled', 'true');
      else {
        options.set(option, row);
        row.addEventListener('click', () => choose(option));
      }
      parent.append(row);
    }
  }

  // A live event update can remove a form while its menu is open.
  const removal = new MutationObserver(() => {
    if (!select.isConnected || !dialog.isConnected) close();
  });
  const optionChanges = new MutationObserver(() => {
    if (select.matches(':disabled') || !select.isConnected) { close(); return; }
    draw();
    if (!options.size) { close(); return; }
    position();
    highlight(active && options.has(active) ? active : Array.from(options.keys()).find(o => o.selected) || options.keys().next().value);
  });
  draw();
  if (!options.size) { dialog.remove(); return; }
  select.focus({ preventScroll: true });
  select.setAttribute('aria-controls', list.id);
  select.setAttribute('aria-expanded', 'true');
  dialog.showModal();
  position();
  highlight(Array.from(options.keys()).find(option => option.selected) || options.keys().next().value);
  removal.observe(document.body, { childList: true, subtree: true });
  optionChanges.observe(select, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled','hidden','label','value','selected'] });

  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); }, { signal });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX >= r.right || event.clientY < r.top || event.clientY >= r.bottom) close();
  }, { signal });
  dialog.addEventListener('keydown', event => {
    dialog.setAttribute('data-keyboard', '');
    const rows = Array.from(options.keys());
    const index = active ? rows.indexOf(active) : 0;
    switch (event.key) {
      case 'Escape': case 'Tab':
        if (event.key === 'Escape') event.preventDefault();
        event.stopPropagation(); close(); return;
      case 'Enter': case ' ':
        event.preventDefault(); event.stopPropagation(); if (active) choose(active); return;
      case 'Home': highlight(rows[0]); break;
      case 'End': highlight(rows.at(-1)); break;
      case 'ArrowDown': highlight(rows[Math.min(rows.length - 1, index + 1)]); break;
      case 'ArrowUp': highlight(rows[Math.max(0, index - 1)]); break;
      default: {
        if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
        const key = event.key.toLocaleLowerCase();
        const time = Date.now();
        search = time - lastKey > 600 || search === key ? key : search + key;
        lastKey = time;
        const after = rows.slice(index + 1).concat(rows.slice(0, index + 1));
        highlight(after.find(option => option.label.trim().toLocaleLowerCase().startsWith(search)));
      }
    }
    event.preventDefault(); event.stopPropagation();
  }, { signal });
  window.addEventListener('resize', position, { signal });
  window.visualViewport?.addEventListener('resize', position, { signal });
  window.visualViewport?.addEventListener('scroll', position, { signal });
  document.addEventListener('scroll', event => {
    if (event.target instanceof Node && !dialog.contains(event.target)) position();
  }, { capture: true, signal });
  window.addEventListener('popstate', close, { signal });
  window.addEventListener('hashchange', close, { signal });
  window.addEventListener('pagehide', close, { signal });
}

function installChoiceLists() {
  if (!window.HTMLDialogElement?.prototype.showModal || document.documentElement.hasAttribute('data-farm-choices')) return;
  document.documentElement.setAttribute('data-farm-choices', '');
  // A multi-choice field stays open while several boxes are ticked.
  const multi = 'details.k-check-select[open], details.many-pick[open]';
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !(event.target instanceof Element)) return;
    const open = event.target.closest<HTMLDetailsElement>(multi);
    if (!open) return;
    event.preventDefault(); event.stopPropagation();
    open.open = false;
    open.querySelector('summary')?.focus();
  }, true);
  document.addEventListener('click', event => {
    document.querySelectorAll<HTMLDetailsElement>(multi).forEach(open => {
      if (event.target instanceof Node && !open.contains(event.target)) open.open = false;
    });
  }, true);
  const field = (target: EventTarget | null) =>
    target instanceof HTMLSelectElement && !target.multiple && target.size <= 1 && !target.matches(':disabled') ? target : null;
  document.addEventListener('mousedown', event => {
    if (event.button === 0 && field(event.target)) event.preventDefault();
  }, true);
  document.addEventListener('click', event => {
    const select = field(event.target);
    if (!select || event.defaultPrevented || event.button !== 0) return;
    event.preventDefault();
    openChoiceList(select);
  }, true);
  document.addEventListener('keydown', event => {
    const select = field(event.target);
    if (!select || event.ctrlKey || event.metaKey || !['Enter',' ','ArrowDown','ArrowUp','F4'].includes(event.key)) return;
    event.preventDefault();
    openChoiceList(select, true);
  }, true);
}

if (typeof document !== 'undefined') installChoiceLists();
