// Кастомний випадний список замість <select>.
//
// Навіщо: список опцій нативного <select> малює ОС, а не сторінка — його не
// можна стилізувати жодним CSS (звідси біло-синій системний список, що не
// збігався з темною темою). Єдиний спосіб мати свій вигляд — власний віджет.
//
// Компонент навмисно без залежностей і без shadow DOM: він живе і в popup
// (свої CSS-змінні --tr-*), і в панелі поверх YouTube (--subtr-*), тому
// стилі задаються ззовні через класи, а поведінка — тут.
//
// Доступність: роль listbox/option, керування з клавіатури (стрілки, Enter,
// Escape, Home/End), aria-expanded — щоб віджет не був гіршим за нативний,
// який ми замінюємо.

import type { SelectOption } from './constants';

export interface Dropdown {
  el: HTMLElement;
  getValue(): string;
  setValue(value: string): void;
}

export function createDropdown(
  options: SelectOption[],
  initialValue: string,
  ariaLabel: string,
  onChange?: (value: string) => void
): Dropdown {
  let value = initialValue;

  const root = document.createElement('div');
  root.className = 'subtr-dd';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'subtr-dd-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', ariaLabel);

  const label = document.createElement('span');
  label.className = 'subtr-dd-label';
  trigger.appendChild(label);

  const chevron = document.createElement('span');
  chevron.className = 'subtr-dd-chevron';
  chevron.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" '
    + 'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
  trigger.appendChild(chevron);

  const menu = document.createElement('div');
  menu.className = 'subtr-dd-menu';
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-label', ariaLabel);

  const optionEls: HTMLButtonElement[] = options.map((opt) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'subtr-dd-opt';
    item.setAttribute('role', 'option');
    item.dataset.value = opt.value;

    const main = document.createElement('span');
    main.className = 'subtr-dd-opt-label';
    main.textContent = opt.label;
    item.appendChild(main);

    if (opt.hint) {
      const hint = document.createElement('span');
      hint.className = 'subtr-dd-opt-hint';
      hint.textContent = opt.hint;
      item.appendChild(hint);
    }

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      setValue(opt.value);
      close();
      trigger.focus();
      onChange?.(opt.value);
    });

    menu.appendChild(item);
    return item;
  });

  root.appendChild(trigger);
  root.appendChild(menu);

  function render(): void {
    const selected = options.find((o) => o.value === value);
    // Значення може прийти з бекенду/storage і не бути у списку (напр. модель,
    // яку користувач вписав руками у старій версії) — показуємо як є, щоб не
    // вдавати, ніби вибрано щось інше.
    label.textContent = selected ? selected.label : value;
    optionEls.forEach((el) => {
      const isSelected = el.dataset.value === value;
      el.classList.toggle('is-selected', isSelected);
      el.setAttribute('aria-selected', String(isSelected));
    });
  }

  function open(): void {
    root.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    const selected = optionEls.find((el) => el.dataset.value === value);
    (selected ?? optionEls[0])?.focus();
  }

  function close(): void {
    root.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
  }

  function isOpen(): boolean {
    return root.classList.contains('is-open');
  }

  function setValue(next: string): void {
    value = next;
    render();
  }

  function moveFocus(delta: number): void {
    const focused = optionEls.indexOf(document.activeElement as HTMLButtonElement);
    const from = focused === -1 ? optionEls.findIndex((el) => el.dataset.value === value) : focused;
    const next = Math.min(optionEls.length - 1, Math.max(0, (from === -1 ? 0 : from) + delta));
    optionEls[next]?.focus();
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    isOpen() ? close() : open();
  });

  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) {
      e.stopPropagation(); // інакше Esc закриє ще й панель налаштувань
      close();
      trigger.focus();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen()) { open(); return; }
      moveFocus(e.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (isOpen() && (e.key === 'Home' || e.key === 'End')) {
      e.preventDefault();
      (e.key === 'Home' ? optionEls[0] : optionEls[optionEls.length - 1])?.focus();
    }
  });

  // Клік будь-де поза віджетом закриває меню. capture:true — щоб спрацювало
  // навіть якщо сторінка (YouTube) гасить події на шляху вгору.
  document.addEventListener('mousedown', (e) => {
    if (isOpen() && !root.contains(e.target as Node)) close();
  }, true);

  render();

  return {
    el: root,
    getValue: () => value,
    setValue
  };
}
