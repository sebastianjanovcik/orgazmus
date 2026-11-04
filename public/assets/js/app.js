/* Jadro drží spoločné pomocné moduly; ďalšie kroky naň nadviažu obrazovkami a formulármi. */
(function ($, window, document) {
    'use strict';

    /* Kľúče sú spoločné pre oba jazyky; pri neznámom kľúči zostane čitateľný pôvodný text. */
    const i18n = {
        dictionaries: {
            sk: { all_tasks: 'Všetky úlohy', projects: 'Projekty', calendar: 'Kalendár', done: 'Hotové', stats: 'Štatistiky', settings: 'Nastavenia', project: 'Projekt', login: 'Prihlásenie', register: 'Registrácia', menu: 'Menu', my_projects: 'Moje projekty', add_project: 'Pridať projekt', today_overview: 'PREHĽAD DŇA', language: 'Jazyk', language_help: 'Vyber jazyk rozhrania.', appearance: 'Vzhľad', appearance_help: 'Vyber, ako sa má Tasko zobrazovať.', theme: 'Farebný režim', system: 'Automaticky podľa zariadenia', light: 'Svetlý', dark: 'Tmavý', notifications: 'Upozornenia', no_notifications: 'Nemáš úlohy na dnes ani po termíne.', today: 'Dnes', overdue: 'Po termíne', close: 'Zavrieť', open_tasks: 'Otvorené úlohy', completed_tasks: 'Hotové úlohy', due_today: 'Termín dnes', overdue_count: '{count} upozornení', language_saved: 'Jazyk rozhrania bol zmenený.', theme_saved: 'Téma sa zmenila, ale voľbu sa nepodarilo uložiť.' },
            cs: { all_tasks: 'Všechny úkoly', projects: 'Projekty', calendar: 'Kalendář', done: 'Hotové', stats: 'Statistiky', settings: 'Nastavení', project: 'Projekt', login: 'Přihlášení', register: 'Registrace', menu: 'Menu', my_projects: 'Moje projekty', add_project: 'Přidat projekt', today_overview: 'PŘEHLED DNE', language: 'Jazyk', language_help: 'Vyberte jazyk rozhraní.', appearance: 'Vzhled', appearance_help: 'Vyberte, jak se má Tasko zobrazovat.', theme: 'Barevný režim', system: 'Automaticky podle zařízení', light: 'Světlý', dark: 'Tmavý', notifications: 'Upozornění', no_notifications: 'Nemáte úkoly na dnes ani po termínu.', today: 'Dnes', overdue: 'Po termínu', close: 'Zavřít', open_tasks: 'Otevřené úkoly', completed_tasks: 'Hotové úkoly', due_today: 'Termín dnes', overdue_count: '{count} upozornění', language_saved: 'Jazyk rozhraní byl změněn.', theme_saved: 'Téma se změnila, ale volbu se nepodařilo uložit.' }
        },
        language: 'sk',
        key: 'tasko.language',
        init() {
            try { if (['sk', 'cs'].includes(window.localStorage.getItem(this.key))) this.language = window.localStorage.getItem(this.key); } catch (_) {}
            document.documentElement.lang = this.language;
        },
        t(key) { return this.dictionaries[this.language][key] || this.dictionaries.sk[key] || key; },
        set(language) {
            if (!['sk', 'cs'].includes(language)) return;
            this.language = language;
            document.documentElement.lang = language;
            try { window.localStorage.setItem(this.key, language); } catch (_) { ui.showToast(this.language === 'cs' ? 'Jazyk se změnil, ale volbu se nepodařilo uložit.' : 'Jazyk sa zmenil, ale voľbu sa nepodarilo uložiť.', 'error'); }
            this.apply();
            taskForm.setEditorLanguage();
            router.navigate();
            notifications.update();
        },
        apply(root) {
            (root || document).querySelectorAll('[data-i18n]').forEach((node) => {
                const value = this.t(node.dataset.i18n);
                if (value === node.dataset.i18n) return;
                const textNodes = Array.from(node.childNodes).filter((child) => child.nodeType === Node.TEXT_NODE);
                if (textNodes.length) textNodes[textNodes.length - 1].nodeValue = node.childNodes.length > 1 ? ` ${value}` : value;
                else node.textContent = value;
            });
        }
    };

    /* Jediný HTTP adaptér pridáva spoločné hlavičky a mení chyby API na jednotný tvar. */
    const api = {
        request(method, url, data) {
            const config = window.TASKO_CONFIG || {};
            const headers = {};
            if (config.mockResponse) headers['x-mock-response-name'] = config.mockResponse;
            return new Promise((resolve, reject) => {
                /* Bez vynúteného JSON typu prejde úspešne aj prázdna odpoveď 204. */
                $.ajax({
                    url: `${String(config.apiBase || '').replace(/\/$/, '')}${url}`,
                    method,
                    headers,
                    contentType: data === undefined ? undefined : 'application/json; charset=utf-8',
                    data: data === undefined ? undefined : JSON.stringify(data)
                }).done((response) => resolve(response && response.data))
                    .fail((xhr) => {
                        const error = xhr.responseJSON && xhr.responseJSON.error || {};
                        reject({
                            status: xhr.status,
                            code: error.code || 'request_failed',
                            message: error.message || 'Požiadavku sa nepodarilo dokončiť.',
                            fields: error.fields || {}
                        });
                    });
            });
        }
    };

    const state = { routeSequence: 0, user: null, projects: [], tasks: [], projectMembers: [], authReady: false };

    /* Používateľská voľba témy sa uloží lokálne; režim systém preberie nastavenie zariadenia. */
    const theme = {
        key: 'tasko.theme',
        preference: 'system',
        init() {
            try {
                const saved = window.localStorage.getItem(this.key);
                if (['system', 'light', 'dark'].includes(saved)) this.preference = saved;
            } catch (_) { /* Aplikácia funguje aj v prehliadači s vypnutým lokálnym úložiskom. */ }
            this.apply();
        },
        apply() {
            if (this.preference === 'system') document.documentElement.removeAttribute('data-theme');
            else document.documentElement.dataset.theme = this.preference;
            const selector = document.getElementById('theme-preference');
            if (selector) selector.value = this.preference;
            if (selector) dropdowns.sync(selector);
        },
        set(preference) {
            if (!['system', 'light', 'dark'].includes(preference)) return;
            this.preference = preference;
            this.apply();
            try { window.localStorage.setItem(this.key, preference); }
            catch (_) { ui.showToast('Téma sa zmenila, ale voľbu sa nepodarilo uložiť.', 'error'); }
        }
    };

    /* Pri rýchlom prepínaní obrazoviek smie vykresliť výsledok iba posledná požiadavka. */
    const router = {
        tasksMarkup: null,
        routes: {
            login: { title: 'login', auth: true }, register: { title: 'register', auth: true },
            tasks: { title: 'all_tasks' }, projects: { title: 'projects' },
            calendar: { title: 'calendar' }, done: { title: 'done' },
            stats: { title: 'stats' }, settings: { title: 'settings' }
        },
        current() {
            const parts = window.location.hash.replace(/^#\/?/, '').split('-');
            return { name: parts[0] || 'tasks', id: parts.slice(1).join('-') };
        },
        navigate() {
            dropdowns.close();
            datePicker.close();
            const sequence = ++state.routeSequence;
            const route = this.current();
            /* Aplikačné obrazovky sú súkromné; samotná kontrola prehliadača je len UX vrstva. */
            if (state.authReady && !state.user && !['login', 'register'].includes(route.name)) {
                window.location.hash = 'login';
                return;
            }
            if (state.authReady && state.user && ['login', 'register'].includes(route.name)) {
                window.location.hash = 'tasks';
                return;
            }
            const page = route.name === 'project' ? { title: 'project' } : (this.routes[route.name] || this.routes.tasks);
            const title = i18n.t(page.title);
            document.title = `Tasko – ${title}`;
            document.body.classList.toggle('auth-route', Boolean(page.auth));
            const view = document.getElementById('view');
            if (view) {
                dropdowns.dispose(view);
                if (!this.tasksMarkup) this.tasksMarkup = view.innerHTML;
                if (route.name === 'tasks') view.innerHTML = this.tasksMarkup;
                else if (route.name === 'projects') view.innerHTML = `<div class="page-heading"><div><p class="eyebrow">TASKO</p><h1 id="page-title">Projekty</h1><p class="page-subtitle">Všetky tvoje projekty a ich priebeh na jednom mieste.</p></div><button class="button button-primary project-create-button" type="button" data-action="project-open">＋ Nový projekt</button></div><div id="project-limit-notice" class="project-limit-notice" hidden></div><div id="project-list" class="project-grid" aria-live="polite"><div class="project-skeleton"></div><div class="project-skeleton"></div><div class="project-skeleton"></div></div>`;
                else if (route.name === 'project') view.innerHTML = `<div id="project-detail-view" class="project-detail-view"><div class="project-skeleton"></div></div>`;
                else if (route.name === 'settings') {
                    view.innerHTML = `<div class="page-heading"><div><p class="eyebrow">TASKO</p><h1 id="page-title">${title}</h1></div></div><section class="settings-card" aria-labelledby="language-heading"><h2 id="language-heading">${i18n.t('language')}</h2><p>${i18n.t('language_help')}</p><label for="language-preference">${i18n.t('language')}</label><select id="language-preference"><option value="sk">Slovenčina</option><option value="cs">Čeština</option></select></section><section class="settings-card" aria-labelledby="appearance-heading"><h2 id="appearance-heading">${i18n.t('appearance')}</h2><p>${i18n.t('appearance_help')}</p><label for="theme-preference">${i18n.t('theme')}</label><select id="theme-preference"><option value="system">${i18n.t('system')}</option><option value="light">${i18n.t('light')}</option><option value="dark">${i18n.t('dark')}</option></select></section>`;
                    document.getElementById('language-preference').value = i18n.language;
                    theme.apply();
                } else if (!page.auth) {
                    view.innerHTML = `<div class="page-heading"><div><p class="eyebrow">TASKO</p><h1>${title}</h1><p class="page-subtitle">Obsah tejto obrazovky sa pripravuje.</p></div></div>`;
                }
            }
            /* Nadpis aktualizujeme až po obnove obsahu, aby sa do šablóny úloh neuložil názov inej trasy. */
            const heading = document.getElementById('page-title');
            if (heading) heading.textContent = title;
            if (view) dropdowns.init(view);
            document.querySelectorAll('.auth-card').forEach((card) => {
                card.hidden = card.id === 'login-form' ? route.name !== 'login' : route.name !== 'register';
            });
            document.querySelectorAll('.nav-link').forEach((link) => {
                const active = link.getAttribute('href') === `#${route.name}`;
                link.classList.toggle('is-active', active);
                if (active) link.setAttribute('aria-current', 'page');
                else link.removeAttribute('aria-current');
            });
            if (route.name === 'tasks' && state.user) views.loadTasks(sequence);
            if (['calendar', 'done', 'stats'].includes(route.name) && state.user) views.loadInsights(sequence, route.name);
            if ((route.name === 'projects' || route.name === 'project') && state.user) views.loadProjects(sequence, route);
            if (route.name === 'settings' && state.user) views.loadSidebarProjects(sequence);
            if (sequence !== state.routeSequence) return;
        }
    };

    /* Upozornenia sú odvodené z už načítaných otvorených úloh; mock API sa tým nemení. */
    const notifications = {
        relevantTasks() {
            const today = components.today();
            return state.tasks.filter((task) => !task.is_done && task.due_date && task.due_date <= today)
                .sort((a, b) => a.due_date.localeCompare(b.due_date));
        },
        update() {
            const button = document.querySelector('.notification-button');
            const badge = document.querySelector('.notification-dot');
            if (!button || !badge) return;
            const count = this.relevantTasks().length;
            badge.hidden = count === 0;
            badge.setAttribute('aria-label', i18n.t('overdue_count').replace('{count}', count));
            button.setAttribute('aria-label', `${i18n.t('notifications')} (${count})`);
        },
        show() {
            const tasks = this.relevantTasks();
            const panel = document.getElementById('notification-panel');
            const list = document.getElementById('notification-list');
            if (!panel || !list) return;
            list.replaceChildren();
            if (!tasks.length) {
                const empty = document.createElement('li'); empty.className = 'notification-empty';
                empty.textContent = i18n.t('no_notifications'); list.append(empty);
            } else tasks.forEach((task) => {
                const row = document.createElement('li');
                const label = document.createElement('span');
                label.className = task.due_date < components.today() ? 'notification-overdue' : 'notification-today';
                label.textContent = task.due_date < components.today() ? i18n.t('overdue') : i18n.t('due_today');
                const title = document.createElement('span'); title.textContent = task.title;
                row.append(label, title); list.append(row);
            });
            panel.hidden = false;
            document.querySelector('.notification-button').setAttribute('aria-expanded', 'true');
        },
        scheduleMidnight() {
            const now = new Date();
            const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
            window.setTimeout(() => {
                this.update();
                if (router.current().name === 'tasks' && state.user) views.loadTasks(state.routeSequence);
                this.scheduleMidnight();
            }, next.getTime() - now.getTime());
        }
    };

    /* Vlastné menu dáva ponukám jednotný vzhľad; skrytý select ostáva zdrojom hodnoty formulára. */
    const dropdowns = {
        active: null,
        dispose(root) {
            root.querySelectorAll('select[data-dropdown-ready]').forEach((select) => {
                document.getElementById(`${select.id}-listbox`)?.remove();
            });
        },
        init(root) {
            (root || document).querySelectorAll('select').forEach((select) => {
                if (select.dataset.dropdownReady) { this.sync(select); return; }
                select.dataset.dropdownReady = 'true';
                const label = document.querySelector(`label[for="${select.id}"]`);
                if (label) label.htmlFor = `${select.id}-trigger`;
                const wrapper = document.createElement('div');
                wrapper.className = 'styled-select';
                select.parentNode.insertBefore(wrapper, select);
                wrapper.append(select);
                select.classList.add('native-select-source');
                select.tabIndex = -1;
                select.setAttribute('aria-hidden', 'true');
                const trigger = document.createElement('button');
                trigger.type = 'button';
                trigger.className = 'styled-select-trigger';
                trigger.id = `${select.id}-trigger`;
                trigger.setAttribute('role', 'combobox');
                trigger.setAttribute('aria-haspopup', 'listbox');
                trigger.setAttribute('aria-expanded', 'false');
                trigger.setAttribute('aria-controls', `${select.id}-listbox`);
                trigger.setAttribute('aria-label', label?.textContent.trim() || select.getAttribute('aria-label') || 'Výber');
                if (select.required) trigger.setAttribute('aria-required', 'true');
                if (select.getAttribute('aria-describedby')) trigger.setAttribute('aria-describedby', select.getAttribute('aria-describedby'));
                const value = document.createElement('span'); value.className = 'styled-select-value';
                const chevron = document.createElement('span'); chevron.className = 'styled-select-chevron'; chevron.setAttribute('aria-hidden', 'true');
                trigger.append(value, chevron);
                wrapper.append(trigger);
                const listbox = document.createElement('div');
                listbox.className = 'styled-select-menu';
                listbox.id = `${select.id}-listbox`;
                listbox.setAttribute('role', 'listbox');
                listbox.setAttribute('aria-label', trigger.getAttribute('aria-label'));
                listbox.hidden = true;
                document.body.append(listbox);
                trigger.addEventListener('click', () => listbox.hidden ? this.open(select) : this.close());
                trigger.addEventListener('keydown', (event) => this.keydown(event, select));
                select.addEventListener('change', () => this.sync(select));
                this.sync(select);
            });
        },
        sync(select) {
            const wrapper = select.closest('.styled-select');
            if (!wrapper) return;
            const trigger = wrapper.querySelector('.styled-select-trigger');
            const value = wrapper.querySelector('.styled-select-value');
            const listbox = document.getElementById(`${select.id}-listbox`);
            const selected = select.options[select.selectedIndex];
            value.textContent = selected?.textContent || 'Vyber…';
            trigger.disabled = select.disabled || select.options.length === 0;
            if (select.getAttribute('aria-invalid') === 'true') trigger.setAttribute('aria-invalid', 'true');
            else trigger.removeAttribute('aria-invalid');
            listbox.replaceChildren();
            Array.from(select.options).forEach((option, index) => {
                const item = document.createElement('div');
                item.className = 'styled-select-option';
                item.id = `${select.id}-option-${index}`;
                item.setAttribute('role', 'option');
                item.setAttribute('aria-selected', String(option === selected));
                item.setAttribute('aria-disabled', String(option.disabled));
                item.textContent = option.textContent;
                item.dataset.index = String(index);
                item.addEventListener('pointerenter', () => this.activate(select, index));
                item.addEventListener('click', () => { if (!option.disabled) this.choose(select, index); });
                listbox.append(item);
            });
            if (this.active === select && listbox.hidden) this.active = null;
        },
        open(select, index) {
            if (select.disabled) return;
            this.close();
            const wrapper = select.closest('.styled-select');
            const trigger = wrapper.querySelector('.styled-select-trigger');
            const listbox = document.getElementById(`${select.id}-listbox`);
            const rect = trigger.getBoundingClientRect();
            listbox.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8))}px`;
            listbox.style.width = `${rect.width}px`;
            const roomBelow = window.innerHeight - rect.bottom - 12;
            const opensUp = roomBelow < 150 && rect.top > roomBelow;
            listbox.style.maxHeight = `${Math.max(90, Math.min(240, opensUp ? rect.top - 12 : roomBelow))}px`;
            listbox.classList.toggle('opens-up', opensUp);
            listbox.style.top = listbox.classList.contains('opens-up') ? '' : `${rect.bottom + 6}px`;
            listbox.style.bottom = listbox.classList.contains('opens-up') ? `${window.innerHeight - rect.top + 6}px` : '';
            listbox.hidden = false;
            trigger.setAttribute('aria-expanded', 'true');
            this.active = select;
            this.activate(select, index ?? Math.max(0, select.selectedIndex));
        },
        close() {
            if (!this.active) return;
            const wrapper = this.active.closest('.styled-select');
            const listbox = document.getElementById(`${this.active.id}-listbox`);
            listbox.hidden = true;
            listbox.classList.remove('opens-up');
            wrapper.querySelector('.styled-select-trigger').setAttribute('aria-expanded', 'false');
            this.active = null;
        },
        activate(select, index) {
            const wrapper = select.closest('.styled-select');
            const listbox = document.getElementById(`${select.id}-listbox`);
            const options = Array.from(listbox.querySelectorAll('.styled-select-option'));
            const enabled = options.filter((option) => option.getAttribute('aria-disabled') !== 'true');
            if (!enabled.length) return;
            let item = options[index];
            if (!item || item.getAttribute('aria-disabled') === 'true') item = enabled[0];
            options.forEach((option) => option.classList.toggle('is-active', option === item));
            wrapper.querySelector('.styled-select-trigger').setAttribute('aria-activedescendant', item.id);
            item.scrollIntoView({ block: 'nearest' });
        },
        choose(select, index) {
            const option = select.options[index];
            if (!option || option.disabled) return;
            select.selectedIndex = index;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            this.sync(select);
            this.close();
            const trigger = select.closest('.styled-select')?.querySelector('.styled-select-trigger');
            if (trigger?.isConnected) trigger.focus();
        },
        keydown(event, select) {
            const options = Array.from(select.options);
            const current = select.selectedIndex;
            let next = current;
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                if (document.getElementById(`${select.id}-listbox`).hidden) this.open(select, current);
                next = (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
                this.activate(select, next);
            } else if (event.key === 'Home' || event.key === 'End') {
                event.preventDefault();
                if (document.getElementById(`${select.id}-listbox`).hidden) this.open(select);
                next = event.key === 'Home' ? 0 : options.length - 1;
                this.activate(select, next);
            } else if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                const active = document.getElementById(`${select.id}-listbox`).querySelector('.styled-select-option.is-active');
                if (!document.getElementById(`${select.id}-listbox`).hidden && active) this.choose(select, Number(active.dataset.index));
                else this.open(select);
            } else if (event.key === 'Escape') this.close();
            else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
                const start = current + 1;
                const ordered = options.slice(start).concat(options.slice(0, start));
                const match = ordered.find((option) => option.textContent.trim().toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()));
                if (match) { event.preventDefault(); this.open(select, options.indexOf(match)); }
            }
        }
    };

    document.addEventListener('click', (event) => {
        if (dropdowns.active) {
            const wrapper = dropdowns.active.closest('.styled-select');
            const listbox = document.getElementById(`${dropdowns.active.id}-listbox`);
            if (!wrapper.contains(event.target) && !listbox.contains(event.target)) dropdowns.close();
        }
    });

    /* Kalendár termínu používa lokálne dátumy, aby sa pri ukladaní neposunul deň cez UTC. */
    const datePicker = {
        active: null,
        init(root) {
            (root || document).querySelectorAll('input[type="date"]').forEach((input) => {
                if (input.dataset.datePickerReady) { this.sync(input); return; }
                input.dataset.datePickerReady = 'true';
                const label = document.querySelector(`label[for="${input.id}"]`);
                if (label) label.htmlFor = `${input.id}-trigger`;
                const wrapper = document.createElement('div'); wrapper.className = 'date-picker';
                input.parentNode.insertBefore(wrapper, input); wrapper.append(input);
                input.classList.add('native-date-source'); input.tabIndex = -1; input.setAttribute('aria-hidden', 'true');
                const trigger = document.createElement('button');
                trigger.type = 'button'; trigger.className = 'date-picker-trigger'; trigger.id = `${input.id}-trigger`;
                trigger.setAttribute('aria-haspopup', 'dialog'); trigger.setAttribute('aria-expanded', 'false'); trigger.setAttribute('aria-controls', `${input.id}-calendar`);
                trigger.setAttribute('aria-label', label?.textContent.trim() || 'Termín');
                if (input.required) trigger.setAttribute('aria-required', 'true');
                if (input.getAttribute('aria-describedby')) trigger.setAttribute('aria-describedby', input.getAttribute('aria-describedby'));
                const text = document.createElement('span'); text.className = 'date-picker-value';
                const icon = document.createElement('span'); icon.className = 'date-picker-icon'; icon.setAttribute('aria-hidden', 'true');
                trigger.append(text, icon); wrapper.append(trigger);
                const menu = document.createElement('section'); menu.className = 'date-picker-menu'; menu.id = `${input.id}-calendar`;
                menu.setAttribute('role', 'dialog'); menu.setAttribute('aria-label', i18n.language === 'cs' ? 'Výběr termínu' : 'Výber termínu'); menu.hidden = true;
                const header = document.createElement('div'); header.className = 'date-picker-header';
                const previous = document.createElement('button'); previous.type = 'button'; previous.className = 'date-picker-month-button'; previous.dataset.month = '-1'; previous.setAttribute('aria-label', i18n.language === 'cs' ? 'Předchozí měsíc' : 'Predchádzajúci mesiac'); previous.textContent = '‹';
                const heading = document.createElement('h3'); heading.id = `${input.id}-month-heading`;
                const next = document.createElement('button'); next.type = 'button'; next.className = 'date-picker-month-button'; next.dataset.month = '1'; next.setAttribute('aria-label', i18n.language === 'cs' ? 'Následující měsíc' : 'Nasledujúci mesiac'); next.textContent = '›';
                header.append(previous, heading, next);
                const weekdays = document.createElement('div'); weekdays.className = 'date-picker-weekdays'; weekdays.setAttribute('aria-hidden', 'true');
                const locale = i18n.language === 'cs' ? 'cs-CZ' : 'sk-SK';
                for (let day = 5; day <= 11; day += 1) {
                    const name = document.createElement('span'); name.textContent = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2026, 0, day)); weekdays.append(name);
                }
                const grid = document.createElement('div'); grid.className = 'date-picker-grid'; grid.setAttribute('role', 'grid'); grid.setAttribute('aria-labelledby', heading.id);
                menu.append(header, weekdays, grid); document.body.append(menu);
                trigger.addEventListener('click', () => menu.hidden ? this.open(input) : this.close());
                trigger.addEventListener('keydown', (event) => {
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); this.open(input); }
                });
                menu.querySelectorAll('[data-month]').forEach((button) => button.addEventListener('click', () => this.shiftMonth(input, Number(button.dataset.month))));
                menu.addEventListener('click', (event) => {
                    const day = event.target.closest('[data-date]');
                    if (day) this.choose(input, day.dataset.date);
                });
                menu.addEventListener('keydown', (event) => this.keydown(event, input));
                input.addEventListener('change', () => this.sync(input));
                this.sync(input);
            });
        },
        sync(input) {
            const wrapper = input.closest('.date-picker'); if (!wrapper) return;
            const trigger = wrapper.querySelector('.date-picker-trigger');
            const value = wrapper.querySelector('.date-picker-value');
            trigger.disabled = input.disabled;
            if (input.getAttribute('aria-invalid') === 'true') trigger.setAttribute('aria-invalid', 'true');
            else trigger.removeAttribute('aria-invalid');
            if (!input.value) value.textContent = i18n.language === 'cs' ? 'Vyberte termín' : 'Vyber termín';
            else {
                const [year, month, day] = input.value.split('-').map(Number);
                value.textContent = new Intl.DateTimeFormat(i18n.language === 'cs' ? 'cs-CZ' : 'sk-SK', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(year, month - 1, day));
            }
        },
        open(input) {
            if (input.disabled) return;
            dropdowns.close(); this.close();
            const wrapper = input.closest('.date-picker'); const trigger = wrapper.querySelector('.date-picker-trigger');
            const menu = document.getElementById(`${input.id}-calendar`); const rect = trigger.getBoundingClientRect();
            const width = Math.min(336, window.innerWidth - 24);
            const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
            const below = window.innerHeight - rect.bottom - 12; const opensUp = below < 300 && rect.top > below;
            menu.style.left = `${left}px`; menu.style.width = `${width}px`;
            menu.style.maxHeight = `${Math.max(220, Math.min(390, opensUp ? rect.top - 12 : below))}px`;
            menu.style.top = opensUp ? '' : `${rect.bottom + 6}px`;
            menu.style.bottom = opensUp ? `${window.innerHeight - rect.top + 6}px` : '';
            const date = input.value ? this.parse(input.value) : this.parse(components.today());
            menu.dataset.year = String(date.getFullYear()); menu.dataset.month = String(date.getMonth());
            this.render(input); menu.hidden = false; trigger.setAttribute('aria-expanded', 'true'); this.active = input;
            const selected = input.value || components.today();
            this.focusDay(menu, selected);
        },
        parse(value) { const [year, month, day] = value.split('-').map(Number); return new Date(year, month - 1, day); },
        toISO(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; },
        render(input) {
            const menu = document.getElementById(`${input.id}-calendar`);
            const year = Number(menu.dataset.year); const month = Number(menu.dataset.month);
            const locale = i18n.language === 'cs' ? 'cs-CZ' : 'sk-SK';
            menu.querySelector('h3').textContent = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(year, month, 1));
            const grid = menu.querySelector('.date-picker-grid'); grid.replaceChildren();
            const first = new Date(year, month, 1); const mondayOffset = (first.getDay() + 6) % 7;
            const start = new Date(year, month, 1 - mondayOffset); const today = components.today();
            for (let index = 0; index < 42; index += 1) {
                const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index); const iso = this.toISO(date);
                const button = document.createElement('button'); button.type = 'button'; button.className = 'date-picker-day';
                button.dataset.date = iso; button.textContent = String(date.getDate());
                button.setAttribute('aria-label', new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(date));
                button.setAttribute('aria-pressed', String(input.value === iso));
                if (date.getMonth() !== month) button.classList.add('is-outside-month');
                if (iso === today) { button.classList.add('is-today'); button.setAttribute('aria-current', 'date'); }
                if (input.value === iso) button.classList.add('is-selected');
                grid.append(button);
            }
        },
        shiftMonth(input, amount) {
            const menu = document.getElementById(`${input.id}-calendar`);
            const current = new Date(Number(menu.dataset.year), Number(menu.dataset.month) + amount, 1);
            menu.dataset.year = String(current.getFullYear()); menu.dataset.month = String(current.getMonth());
            this.render(input);
            const day = input.value ? this.parse(input.value).getDate() : new Date().getDate();
            this.focusDay(menu, this.toISO(new Date(current.getFullYear(), current.getMonth(), Math.min(day, new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate()))));
        },
        focusDay(menu, iso) { menu.querySelector(`[data-date="${iso}"]`)?.focus(); },
        choose(input, iso) {
            input.value = iso; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
            this.sync(input); this.close();
            const trigger = input.closest('.date-picker')?.querySelector('.date-picker-trigger'); if (trigger?.isConnected) trigger.focus();
        },
        close() {
            if (!this.active) return;
            const input = this.active; const menu = document.getElementById(`${input.id}-calendar`);
            if (menu) menu.hidden = true;
            input.closest('.date-picker')?.querySelector('.date-picker-trigger')?.setAttribute('aria-expanded', 'false');
            this.active = null;
        },
        keydown(event, input) {
            const menu = event.currentTarget;
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(); input.closest('.date-picker').querySelector('.date-picker-trigger').focus(); return; }
            const currentButton = event.target.closest('[data-date]'); if (!currentButton) return;
            const current = this.parse(currentButton.dataset.date); let next = null;
            if (event.key === 'ArrowLeft') next = new Date(current.getFullYear(), current.getMonth(), current.getDate() - 1);
            if (event.key === 'ArrowRight') next = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1);
            if (event.key === 'ArrowUp') next = new Date(current.getFullYear(), current.getMonth(), current.getDate() - 7);
            if (event.key === 'ArrowDown') next = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 7);
            if (event.key === 'Home') next = new Date(current.getFullYear(), current.getMonth(), current.getDate() - ((current.getDay() + 6) % 7));
            if (event.key === 'End') next = new Date(current.getFullYear(), current.getMonth(), current.getDate() + (6 - ((current.getDay() + 6) % 7)));
            if (event.key === 'PageUp' || event.key === 'PageDown') {
                event.preventDefault(); this.shiftMonth(input, event.key === 'PageUp' ? -1 : 1); return;
            }
            if (next) {
                event.preventDefault(); const month = document.getElementById(`${input.id}-calendar`);
                if (next.getMonth() !== Number(month.dataset.month) || next.getFullYear() !== Number(month.dataset.year)) { month.dataset.year = String(next.getFullYear()); month.dataset.month = String(next.getMonth()); this.render(input); }
                this.focusDay(menu, this.toISO(next));
            }
        }
    };

    document.addEventListener('click', (event) => {
        if (datePicker.active) {
            const wrapper = datePicker.active.closest('.date-picker');
            const menu = document.getElementById(`${datePicker.active.id}-calendar`);
            if (!wrapper.contains(event.target) && !menu.contains(event.target)) datePicker.close();
        }
    });

    const ui = {
        toastTimer: null,
        panelReturnTargets: new WeakMap(),
        showToast(text, type) {
            const toast = document.getElementById('toast');
            if (!toast) return;
            toast.textContent = text;
            toast.dataset.type = type || 'info';
            toast.classList.add('is-visible');
            window.clearTimeout(this.toastTimer);
            this.toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2800);
        },
        confirm(message, title, confirmLabel) {
            const dialog = document.getElementById('confirm-dialog');
            if (!dialog || dialog.open) return Promise.resolve(false);
            document.getElementById('confirm-dialog-title').textContent = title || 'Potvrdenie';
            document.getElementById('confirm-dialog-message').textContent = message;
            const confirmButton = document.getElementById('confirm-dialog-submit');
            confirmButton.textContent = confirmLabel || 'Potvrdiť';
            return new Promise((resolve) => {
                dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
                dialog.showModal();
                confirmButton.focus();
            });
        },
        openPanel(id) {
            const panel = document.getElementById(id);
            if (!panel) return;
            /* Po zavretí dialógu sa klávesnica vráti na prvok, ktorý ho otvoril. */
            this.panelReturnTargets.set(panel, document.activeElement);
            panel.classList.add('is-open');
            panel.setAttribute('aria-hidden', 'false');
            const scrim = document.querySelector('.scrim');
            if (scrim) scrim.classList.add('is-visible');
            const firstControl = panel.querySelector('button, input, select, textarea');
            if (firstControl) firstControl.focus();
        },
        closePanels() {
            datePicker.close();
            let returnTarget = null;
            document.querySelectorAll('.panel.is-open').forEach((panel) => {
                const target = this.panelReturnTargets.get(panel);
                if (target && target.isConnected) returnTarget = target;
                panel.classList.remove('is-open');
                panel.setAttribute('aria-hidden', 'true');
            });
            const scrim = document.querySelector('.scrim');
            if (scrim) scrim.classList.remove('is-visible');
            if (returnTarget) returnTarget.focus();
        }
    };

    const components = {
        localDateStr(date) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        },
        today() { return this.localDateStr(new Date()); },
        addDays(value, amount) {
            const [year, month, day] = value.split('-').map(Number);
            const date = new Date(year, month - 1, day);
            date.setDate(date.getDate() + amount);
            return this.localDateStr(date);
        },
        initials(name) {
            const words = String(name || '').normalize('NFC').trim().split(/\s+/u).filter(Boolean);
            return words.length ? `${Array.from(words[0])[0]}${words.length > 1 ? Array.from(words[words.length - 1])[0] : ''}`.toLocaleUpperCase('sk') : '';
        }
    };

    /* Profilové prvky sa odvodzujú z API používateľa, aby avatar aj plán zostali po prihlásení súdržné. */
    const profile = {
        render() {
            const user = state.user;
            if (!user) return;
            const premium = user.plan === 'premium';
            const initials = components.initials(user.name) || '?';
            const avatar = document.querySelector('.avatar');
            const preview = document.querySelector('.profile-preview');
            if (avatar) {
                avatar.textContent = initials;
                avatar.setAttribute('aria-label', `Otvoriť profil: ${user.name}${premium ? ', Premium' : ''}`);
                avatar.classList.toggle('is-premium', premium);
                avatar.dataset.plan = user.plan;
            }
            if (preview) preview.textContent = initials;
            const form = document.getElementById('profile-form');
            if (form) {
                form.elements.name.value = user.name || '';
                form.querySelector('.profile-email').textContent = user.email || '';
                form.querySelector('.profile-plan').textContent = premium ? '👑 Premium' : 'Standard';
                const toggle = form.querySelector('.demo-plan-toggle');
                const demoMode = Boolean((window.TASKO_CONFIG || {}).demoMode);
                toggle.hidden = !demoMode;
                toggle.textContent = premium ? 'Prepnúť na Standard (demo)' : 'Vyskúšať Premium (demo)';
            }
        },
        clearErrors() {
            const form = document.getElementById('profile-form');
            form.querySelectorAll('.field-error').forEach((node) => { node.textContent = ''; });
            form.querySelectorAll('[aria-invalid="true"]').forEach((node) => node.removeAttribute('aria-invalid'));
        },
        showErrors(fields) {
            const form = document.getElementById('profile-form');
            Object.entries(fields || {}).forEach(([name, message]) => {
                const input = form.elements[name];
                const error = document.getElementById(`profile-${name.replaceAll('_', '-')}-error`);
                if (input) input.setAttribute('aria-invalid', 'true');
                if (error) error.textContent = message;
            });
            const firstInvalid = form.querySelector('[aria-invalid="true"]');
            if (firstInvalid) firstInvalid.focus();
        },
        async save(button) {
            const form = document.getElementById('profile-form');
            this.clearErrors();
            const name = form.elements.name.value.trim();
            const currentPassword = form.elements.current_password.value;
            const newPassword = form.elements.new_password.value;
            const fields = {};
            if (!name || name.length > 60) fields.name = 'Meno musí mať 1 až 60 znakov.';
            if (Boolean(currentPassword) !== Boolean(newPassword)) {
                fields[currentPassword ? 'new_password' : 'current_password'] = 'Vyplň obe polia na zmenu hesla.';
            } else if (newPassword && newPassword.length < 8) {
                fields.new_password = 'Heslo musí mať aspoň 8 znakov.';
            }
            if (Object.keys(fields).length) return this.showErrors(fields);
            button.disabled = true;
            try {
                if (name !== state.user.name) state.user = await api.request('PATCH', '/api/me', { name });
                if (currentPassword && newPassword) {
                    await api.request('PATCH', '/api/me/password', { current_password: currentPassword, new_password: newPassword });
                }
                this.render();
                form.elements.current_password.value = '';
                form.elements.new_password.value = '';
                ui.showToast('Profil bol uložený.');
            } catch (error) {
                if (error.status === 422) this.showErrors(error.fields);
                else ui.showToast(error.message || 'Profil sa nepodarilo uložiť.', 'error');
            } finally {
                button.disabled = false;
            }
        },
        async togglePlan(button) {
            const nextPlan = state.user.plan === 'premium' ? 'standard' : 'premium';
            button.disabled = true;
            try {
                state.user = await api.request('PATCH', '/api/me/plan', { plan: nextPlan });
                this.render();
                projectManager.renderList();
                ui.showToast(`Plán bol prepnutý na ${nextPlan === 'premium' ? 'Premium' : 'Standard'} (demo).`);
            } catch (error) {
                ui.showToast(error.message || 'Plán sa nepodarilo zmeniť.', 'error');
            } finally {
                button.disabled = false;
            }
        }
    };

    /* Plochý zoznam API sa skladá do stromu; text používateľa sa vždy vkladá cez textContent. */
    const commentThreads = {
        taskId: null, items: [], container: null, requestSequence: 0,
        /* Štandardný plán zostane zamknutý; poradové číslo zabráni starej odpovedi prepísať novšiu úlohu. */
        async load(taskId) {
            this.taskId = Number(taskId); const sequence = ++this.requestSequence; this.container = document.getElementById('task-comments');
            if (!this.container) return;
            if (state.user?.plan !== 'premium') { this.renderLocked(); return; }
            this.container.setAttribute('aria-busy', 'true'); this.container.innerHTML = '<div class="comment-skeleton" aria-hidden="true"></div>';
            try {
                const items = await api.request('GET', `/api/tasks/${encodeURIComponent(taskId)}/comments`);
                if (sequence !== this.requestSequence || this.taskId !== Number(taskId) || !this.container?.isConnected) return;
                this.items = Array.isArray(items) ? items : []; this.render();
            } catch (error) {
                if (sequence !== this.requestSequence || this.taskId !== Number(taskId) || !this.container?.isConnected) return;
                if (error.status === 403 || error.code === 'premium_required') this.renderLocked();
                else this.renderError(error);
            }
        },
        renderLocked() {
            const box = document.createElement('div'); box.className = 'comments-locked';
            const heading = document.createElement('h4'); heading.textContent = '🔒 Komentáre sú funkcia Premium';
            const message = document.createElement('p'); message.textContent = 'Vo vlákne môžeš viesť diskusiu k úlohe. Pre pridávanie komentárov a odpovedí je potrebný plán Premium.';
            box.append(heading, message); this.container.replaceChildren(box); this.container.removeAttribute('aria-busy');
        },
        renderError(error) {
            const box = document.createElement('div'); box.className = 'comment-error';
            const message = document.createElement('p'); message.textContent = error.message || 'Komentáre sa nepodarilo načítať.';
            const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'button button-quiet'; retry.dataset.action = 'comments-retry'; retry.textContent = 'Skúsiť znova';
            box.append(message, retry); this.container.replaceChildren(box); this.container.removeAttribute('aria-busy');
        },
        makeForm(parentId) {
            const form = document.createElement('form'); form.className = 'comment-form'; form.dataset.parentId = parentId == null ? '' : String(parentId);
            const label = document.createElement('label'); label.textContent = parentId == null ? 'Nový komentár' : 'Tvoja odpoveď';
            const field = document.createElement('textarea'); field.name = 'body'; field.rows = 3; field.maxLength = 1000; field.required = true; field.placeholder = 'Napíš komentár…';
            const error = document.createElement('p'); error.className = 'comment-form-error'; error.setAttribute('aria-live', 'polite');
            const submit = document.createElement('button'); submit.type = 'submit'; submit.className = 'button button-primary'; submit.dataset.action = 'comment-submit'; submit.textContent = 'Pridať';
            form.append(label, field, error, submit); return form;
        },
        /* Strom zostavujeme podľa parent_id a hĺbku počítame lokálne pre bezpečné odsadenie a limit odpovedí. */
        render() {
            const root = document.createElement('section'); root.className = 'comments-section'; root.setAttribute('aria-labelledby', 'comments-heading');
            const heading = document.createElement('h4'); heading.id = 'comments-heading'; heading.textContent = `Komentáre (${this.items.length})`; root.append(heading);
            root.append(this.makeForm(null));
            const list = document.createElement('div'); list.className = 'comment-tree';
            const children = new Map();
            this.items.forEach((item) => { const key = item.parent_id == null ? null : String(item.parent_id); if (!children.has(key)) children.set(key, []); children.get(key).push(item); });
            const visited = new Set();
            const appendBranch = (parentId, depth, parentNode) => {
                (children.get(parentId == null ? null : String(parentId)) || []).forEach((item) => {
                    const id = String(item.id); if (visited.has(id) || depth > 4) return; visited.add(id);
                    const article = document.createElement('article'); article.className = 'comment-item'; article.style.setProperty('--comment-depth', String(Math.min(depth, 4))); article.dataset.commentId = id; article.dataset.depth = String(depth);
                    const meta = document.createElement('div'); meta.className = 'comment-meta';
                    const author = document.createElement('strong'); author.textContent = item.author?.name || 'Používateľ';
                    const date = document.createElement('time');
                    if (item.created_at && !Number.isNaN(Date.parse(item.created_at))) { date.dateTime = item.created_at; date.textContent = new Intl.DateTimeFormat('sk-SK', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.created_at)); }
                    meta.append(author, date);
                    const body = document.createElement('p'); body.className = 'comment-body'; body.textContent = item.body || ''; article.append(meta, body);
                    const controls = document.createElement('div'); controls.className = 'comment-controls';
                    if (depth < 4) { const reply = document.createElement('button'); reply.type = 'button'; reply.className = 'text-button'; reply.dataset.action = 'comment-reply'; reply.textContent = 'Odpovedať'; controls.append(reply); }
                    if (item.can_delete) { const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'text-button comment-delete'; remove.dataset.action = 'comment-delete'; remove.textContent = 'Odstrániť'; controls.append(remove); }
                    article.append(controls); (parentNode || list).append(article); appendBranch(id, depth + 1, article);
                });
            };
            appendBranch(null, 0, null);
            if (this.items.length && !visited.size) { const empty = document.createElement('p'); empty.className = 'comments-empty'; empty.textContent = 'Vlákno komentárov sa nepodarilo zostaviť.'; list.append(empty); }
            root.append(list); this.container.replaceChildren(root); this.container.removeAttribute('aria-busy');
        },
        toggleReply(button) {
            const article = button.closest('.comment-item'); const existing = article.querySelector(':scope > .comment-form');
            if (existing) { existing.remove(); return; }
            const item = this.items.find((entry) => String(entry.id) === article.dataset.commentId);
            if (item && Number(article.dataset.depth) < 4) article.append(this.makeForm(item.id));
        },
        /* Hĺbku odvodzujeme z rodičovského reťazca, aby mock ID ani chybná hodnota depth nezmenili limit. */
        depthOf(item) {
            let depth = 0; let parentId = item.parent_id; const visited = new Set([String(item.id)]);
            while (parentId != null) {
                const key = String(parentId); if (visited.has(key)) return 6; visited.add(key);
                const parent = this.items.find((entry) => String(entry.id) === key); if (!parent) return 0;
                depth += 1; parentId = parent.parent_id;
            }
            return depth;
        },
        /* Server zostáva autoritou pre validáciu aj hĺbku; lokálny záznam pomáha mocku bez trvalého úložiska. */
        async submit(form) {
            if (state.user?.plan !== 'premium') { this.renderLocked(); return; }
            const body = form.elements.body.value.trim(); if (!body) { form.elements.body.focus(); return; }
            const parentId = form.dataset.parentId || null;
            const parent = parentId == null ? null : this.items.find((item) => String(item.id) === parentId);
            const depth = parent ? this.depthOf(parent) + 1 : 0;
            const errorTarget = form.querySelector('.comment-form-error');
            if (depth > 4) { if (errorTarget) errorTarget.textContent = 'Odpoveď už prekročila maximálnu hĺbku 4.'; return; }
            const button = form.querySelector('[type="submit"]'); button.disabled = true;
            try {
                const saved = await api.request('POST', `/api/tasks/${encodeURIComponent(this.taskId)}/comments`, { body, parent_id: parent ? (parent.apiId ?? parent.id) : null });
                const collision = saved && this.items.some((item) => String(item.id) === String(saved.id));
                this.items.push({ ...(saved || {}), id: collision || !saved?.id ? `local-${Date.now()}` : saved.id, apiId: saved?.id, task_id: this.taskId, parent_id: parentId, depth, body, author: saved?.author || { name: state.user?.name || 'Ja' }, created_at: saved?.created_at || new Date().toISOString(), can_delete: saved?.can_delete ?? true });
                this.render();
            } catch (error) {
                const target = errorTarget;
                if (target) target.textContent = error.code === 'comment_too_deep' ? 'Odpoveď už prekročila maximálnu hĺbku 4.' : error.message || 'Komentár sa nepodarilo pridať.';
                button.disabled = false;
            }
        },
        /* API zmaže celý podstrom; pred volaním vysvetlíme následok a vyžiadame dve potvrdenia. */
        async remove(button) {
            const item = this.items.find((entry) => String(entry.id) === button.closest('.comment-item')?.dataset.commentId);
            if (!item || !item.can_delete) return;
            const descendants = new Set([String(item.id)]); let changed = true;
            while (changed) { changed = false; this.items.forEach((entry) => { if (descendants.has(String(entry.parent_id)) && !descendants.has(String(entry.id))) { descendants.add(String(entry.id)); changed = true; } }); }
            const count = descendants.size - 1;
            const replyWord = count === 1 ? 'odpoveď' : count >= 2 && count <= 4 ? 'odpovede' : 'odpovedí';
            const message = count ? `Odstránením komentára sa odstráni aj ${count} ${replyWord}. Pokračovať?` : 'Naozaj chceš odstrániť tento komentár?';
            if (!await ui.confirm(message, 'Odstrániť komentár?', 'Pokračovať')) return;
            button.disabled = true;
            try { await api.request('DELETE', `/api/comments/${encodeURIComponent(item.apiId ?? item.id)}`); this.items = this.items.filter((entry) => !descendants.has(String(entry.id))); this.render(); }
            catch (error) { button.disabled = false; ui.showToast(error.message || 'Komentár sa nepodarilo odstrániť.', 'error'); }
        }
    };

    /* Hlavný zoznam si drží vlastné číslo požiadavky, aby staré API odpovede neprepísali novší pohľad. */
    const taskList = {
        requestSequence: 0,
        pendingCompletions: new Set(),
        priorities: { 1: 'Nízka', 2: 'Stredná', 3: 'Vysoká', 4: 'Kritická' },
        plainText(value) {
            /* Popis API môže obsahovať povolené formátovanie; detail zoznamu ukáže iba jeho text. */
            const parsed = new DOMParser().parseFromString(String(value || ''), 'text/html');
            return parsed.body.textContent.trim();
        },
        dateLabel(value) {
            if (!value) return 'Bez termínu';
            const [year, month, day] = value.split('-').map(Number);
            const date = new Date(year, month - 1, day);
            if (Number.isNaN(date.getTime())) return value;
            if (value === components.today()) return 'Dnes';
            if (value < components.today()) return `Po termíne · ${date.toLocaleDateString('sk-SK', { day: 'numeric', month: 'short' })}`;
            return date.toLocaleDateString('sk-SK', { weekday: 'short', day: 'numeric', month: 'short' });
        },
        makeCard(task, projects) {
            /* Text používateľa vkladáme cez textContent a elementy, aby sa názov nikdy nespustil ako HTML. */
            const priority = Math.min(4, Math.max(1, Number(task.priority) || 2));
            const project = projects.get(Number(task.project_id));
            const card = document.createElement('article');
            card.className = `task-card${task.is_done ? ' is-done' : ''}${task.due_date && task.due_date < components.today() && !task.is_done ? ' is-overdue' : ''}`;
            card.dataset.taskId = String(task.id);
            const check = document.createElement('button');
            check.type = 'button';
            check.className = `task-check priority-${['low', 'medium', 'high', 'critical'][priority - 1]}`;
            check.dataset.action = 'task-complete';
            check.setAttribute('aria-label', `${task.is_done ? 'Znovu otvoriť' : 'Označiť ako hotovú'} úlohu ${task.title}`);
            check.setAttribute('aria-pressed', String(Boolean(task.is_done)));
            const main = document.createElement('div');
            main.className = 'task-main';
            const title = document.createElement('button');
            title.type = 'button';
            title.className = 'task-title';
            title.dataset.action = 'task-detail';
            title.textContent = task.title || '';
            main.append(title);
            const description = this.plainText(task.description);
            if (description) {
                const preview = document.createElement('p');
                preview.className = 'task-description';
                preview.textContent = description;
                main.append(preview);
            }
            const meta = document.createElement('div');
            meta.className = 'task-meta';
            const priorityLabel = document.createElement('span');
            priorityLabel.className = `priority priority-${['low', 'medium', 'high', 'critical'][priority - 1]}`;
            priorityLabel.textContent = this.priorities[priority];
            meta.append(priorityLabel);
            if (project) {
                const projectLabel = document.createElement('span');
                projectLabel.className = 'meta-project';
                const dot = document.createElement('i');
                dot.className = 'project-dot';
                dot.style.backgroundColor = project.color || '#6558d3';
                dot.setAttribute('aria-hidden', 'true');
                projectLabel.append(dot, document.createTextNode(project.name));
                meta.append(projectLabel);
            }
            main.append(meta);
            const due = document.createElement('time');
            due.className = 'task-date';
            due.dateTime = task.due_date || '';
            due.textContent = this.dateLabel(task.due_date);
            if (task.due_date && task.due_date < components.today() && !task.is_done) due.setAttribute('aria-label', `Po termíne: ${this.dateLabel(task.due_date)}`);
            card.append(check, main, due);
            return card;
        },
        render(tasks, projects) {
            const open = tasks.filter((task) => !task.is_done);
            const done = tasks.filter((task) => task.is_done);
            const openList = document.getElementById('task-open-list');
            const doneList = document.getElementById('task-done-list');
            if (!openList || !doneList) return;
            openList.replaceChildren();
            doneList.replaceChildren();
            open.forEach((task) => openList.append(this.makeCard(task, projects)));
            done.forEach((task) => doneList.append(this.makeCard(task, projects)));
            this.emptyState(openList, open.length, 'Nemáš otvorené úlohy.', 'task-open-empty');
            this.emptyState(doneList, done.length, 'Zatiaľ nemáš hotové úlohy.', 'task-done-empty');
            this.updateCounts(tasks);
        },
        updateCounts(tasks) {
            const open = tasks.filter((task) => !task.is_done);
            const done = tasks.filter((task) => task.is_done);
            const counts = {
                'open-task-count': String(open.length),
                'overdue-task-count': String(open.filter((task) => task.due_date && task.due_date < components.today()).length),
                'completed-task-count': String(done.length),
                'open-section-count': `${open.length} ${open.length === 1 ? 'úloha' : 'úloh'}`,
                'done-section-count': `${done.length} ${done.length === 1 ? 'úloha' : 'úloh'}`
            };
            // Projektový detail tieto počítadlá nemá; aktualizujeme iba prvky prítomné v aktuálnom pohľade.
            Object.entries(counts).forEach(([id, value]) => {
                const element = document.getElementById(id);
                if (element) element.textContent = value;
            });
        },
        setCardDone(card, button, task, isDone) {
            task.is_done = isDone;
            card.classList.toggle('is-done', isDone);
            card.classList.toggle('is-overdue', Boolean(task.due_date && task.due_date < components.today() && !isDone));
            button.setAttribute('aria-pressed', String(isDone));
            button.setAttribute('aria-label', `${isDone ? 'Znovu otvoriť' : 'Označiť ako hotovú'} úlohu ${task.title}`);
        },
        complete(button) {
            const card = button.closest('.task-card');
            const task = state.tasks.find((item) => String(item.id) === card?.dataset.taskId);
            if (!task || this.pendingCompletions.has(String(task.id))) return;

            const previousState = Boolean(task.is_done);
            const nextState = !previousState;
            const taskId = String(task.id);
            this.pendingCompletions.add(taskId);
            button.disabled = true;
            // Aktualizácia karty a počtov je okamžitá; jej pozícia zostane rovnaká až do ďalšieho načítania.
            this.setCardDone(card, button, task, nextState);
            this.updateCounts(state.tasks);

            api.request('POST', `/api/tasks/${encodeURIComponent(taskId)}/${nextState ? 'complete' : 'uncomplete'}`)
                .then((updatedTask) => {
                    if (updatedTask && typeof updatedTask.is_done === 'boolean') {
                        this.setCardDone(card, button, task, updatedTask.is_done);
                        if (updatedTask.completed_at !== undefined) task.completed_at = updatedTask.completed_at;
                        this.updateCounts(state.tasks);
                    }
                    // Projektový detail má vlastné stĺpce, preto po potvrdení znovu vykreslíme práve jeho úlohy.
                    const route = router.current();
                    if (route.name === 'project') {
                        const project = state.projects.find((item) => Number(item.id) === Number(task.project_id));
                        if (project) projectManager.renderDetail(project);
                    } else {
                        this.render(state.tasks, new Map(state.projects.map((project) => [Number(project.id), project])));
                    }
                })
                .catch((error) => {
                    this.setCardDone(card, button, task, previousState);
                    this.updateCounts(state.tasks);
                    ui.showToast(error.message || 'Stav úlohy sa nepodarilo uložiť.', 'error');
                })
                .finally(() => {
                    this.pendingCompletions.delete(taskId);
                    button.disabled = false;
                });
        },
        emptyState(container, count, message, id) {
            if (count) return;
            const empty = document.createElement('p');
            empty.className = 'task-empty';
            empty.id = id;
            empty.textContent = message;
            container.append(empty);
        },
        loading() {
            ['task-open-list', 'task-done-list'].forEach((id) => {
                const container = document.getElementById(id);
                if (!container) return;
                const count = id === 'task-open-list' ? 3 : 1;
                container.replaceChildren(...Array.from({ length: count }, () => {
                    const row = document.createElement('div');
                    row.className = 'task-skeleton';
                    row.setAttribute('aria-hidden', 'true');
                    return row;
                }));
            });
            document.getElementById('open-section-count').textContent = 'Načítavam…';
            document.getElementById('done-section-count').textContent = 'Načítavam…';
        },
        error(error) {
            ['task-open-list', 'task-done-list'].forEach((id) => {
                const container = document.getElementById(id);
                if (!container) return;
                const box = document.createElement('div');
                box.className = 'task-load-error';
                const message = document.createElement('p');
                message.textContent = error.message || 'Úlohy sa nepodarilo načítať.';
                const retry = document.createElement('button');
                retry.type = 'button';
                retry.className = 'button button-quiet';
                retry.dataset.action = 'tasks-retry';
                retry.textContent = 'Skúsiť znova';
                box.append(message, retry);
                container.replaceChildren(box);
            });
            document.getElementById('open-section-count').textContent = 'Chyba';
            document.getElementById('done-section-count').textContent = 'Chyba';
        },
        showDetail(task) {
            const content = document.getElementById('task-detail-content');
            const project = state.projects.find((item) => Number(item.id) === Number(task.project_id));
            content.replaceChildren();
            const title = document.createElement('h3');
            title.textContent = task.title || '';
            const description = document.createElement('div');
            description.className = 'task-detail-description';
            const safeDescription = taskForm.sanitize(task.description);
            if (safeDescription) description.innerHTML = safeDescription;
            else description.textContent = 'Bez popisu.';
            const facts = document.createElement('dl');
            [[ 'Priorita', this.priorities[Math.min(4, Math.max(1, Number(task.priority) || 2))] ],
                [ 'Projekt', project ? project.name : 'Bez projektu' ], [ 'Termín', this.dateLabel(task.due_date) ],
                [ 'Stav', task.is_done ? 'Hotová' : 'Otvorená' ]].forEach(([label, value]) => {
                const term = document.createElement('dt'); term.textContent = label;
                const detail = document.createElement('dd'); detail.textContent = value;
                facts.append(term, detail);
            });
            content.append(title, description, facts);
            const comments = document.createElement('div'); comments.id = 'task-comments'; comments.className = 'task-comments'; comments.setAttribute('aria-live', 'polite'); comments.setAttribute('aria-busy', 'true');
            comments.innerHTML = '<div class="comment-skeleton" aria-hidden="true"></div>';
            content.append(comments);
            const actions = document.createElement('div');
            actions.className = 'panel-actions';
            if (task.is_done) {
                // Hotovú úlohu možno z detailu odstrániť, ale jej obsah sa už nedá upraviť.
                const remove = document.createElement('button');
                remove.type = 'button'; remove.className = 'button button-danger';
                remove.dataset.action = 'task-delete'; remove.dataset.taskId = String(task.id);
                remove.textContent = 'Odstrániť úlohu';
                actions.append(remove);
            } else {
                const edit = document.createElement('button');
                edit.type = 'button'; edit.className = 'button button-primary';
                edit.dataset.action = 'task-edit'; edit.dataset.taskId = String(task.id);
                edit.textContent = 'Upraviť úlohu';
                actions.append(edit);
            }
            content.append(actions);
            if (router.current().name === 'calendar') {
                // Kalendárový detail zachová vybraný deň aj pri rýchlom vytvorení ďalšej úlohy.
                const addAnother = document.createElement('button');
                addAnother.type = 'button';
                addAnother.className = 'button button-primary calendar-add-task';
                addAnother.dataset.action = 'calendar-add-task';
                addAnother.dataset.dueDate = task.due_date || '';
                addAnother.textContent = 'Pridať ďalšiu úlohu na tento deň';
                content.append(addAnother);
            }
            document.getElementById('task-detail-title').textContent = 'Detail úlohy';
            ui.openPanel('task-detail-panel');
            commentThreads.load(task.id);
        }
    };

    /* Jeden formulár obsluhuje obe operácie; popis sa pred API odoslaním zúži na povolené značky. */
    const taskForm = {
        editingId: null,
        /* Summernote zobrazuje dostupné formátovanie a ponecháva HTML spracované existujúcou sanitizáciou. */
        initEditor() {
            const editor = $('#task-description');
            editor.summernote({
                lang: i18n.language === 'cs' ? 'cs-CZ' : 'sk-SK',
                tooltip: false,
                height: 150,
                minHeight: 120,
                placeholder: editor.attr('data-placeholder'),
                toolbar: [
                    ['style', ['bold', 'italic', 'underline', 'clear']],
                    ['para', ['ul', 'ol']],
                    ['history', ['undo', 'redo']]
                ],
                callbacks: {
                    onPaste(event) {
                        const clipboard = (event.originalEvent || event).clipboardData || window.clipboardData;
                        event.preventDefault();
                        if (!clipboard) return;
                        document.execCommand('insertText', false, clipboard.getData('text/plain'));
                    }
                }
            });
            const editable = editor.next('.note-editor').find('.note-editable');
            editable.attr({ role: 'textbox', 'aria-labelledby': 'task-description-label', 'aria-multiline': 'true', 'aria-describedby': 'task-description-error' });
        },
        getEditorCode() {
            const code = $('#task-description').summernote('code');
            return new DOMParser().parseFromString(code, 'text/html').body.textContent.trim() ? code : '';
        },
        setEditorCode(html) { $('#task-description').summernote('code', html); },
        setEditorLanguage() {
            if (!$('#task-description').next('.note-editor').length) return;
            const code = this.getEditorCode();
            $('#task-description').summernote('destroy');
            this.initEditor();
            this.setEditorCode(code);
        },
        allowedTags: new Set(['B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'BR', 'P', 'DIV']),
        sanitize(html) {
            const parsed = new DOMParser().parseFromString(String(html || ''), 'text/html');
            parsed.querySelectorAll('script, style').forEach((node) => node.remove());
            const clean = (node) => {
                Array.from(node.childNodes).forEach((child) => {
                    if (child.nodeType !== Node.ELEMENT_NODE) return;
                    clean(child);
                    if (!this.allowedTags.has(child.tagName)) {
                        child.replaceWith(...Array.from(child.childNodes));
                    } else {
                        Array.from(child.attributes).forEach((attribute) => child.removeAttribute(attribute.name));
                    }
                });
            };
            clean(parsed.body);
            return parsed.body.innerHTML.trim();
        },
        clearErrors() {
            const form = document.getElementById('task-form');
            form.querySelectorAll('.field-error').forEach((node) => { node.textContent = ''; });
            form.querySelectorAll('[aria-invalid="true"]').forEach((node) => node.removeAttribute('aria-invalid'));
            dropdowns.sync(form.elements.project_id);
            datePicker.sync(form.elements.due_date);
        },
        showErrors(fields) {
            const form = document.getElementById('task-form');
            Object.entries(fields || {}).forEach(([name, message]) => {
                const id = { title: 'task-name', priority: 'task-priority-label', project_id: 'task-project', due_date: 'task-due-date', description: 'task-description' }[name];
                const input = name === 'priority' ? form.querySelector('[name="priority"]') : name === 'description' ? form.querySelector('.note-editable') : id && document.getElementById(id);
                const error = document.getElementById(`task-${name.replace('_', '-')}-error`);
                if (input) input.setAttribute('aria-invalid', 'true');
                if (input?.tagName === 'SELECT') dropdowns.sync(input);
                if (input?.type === 'date') datePicker.sync(input);
                if (error) error.textContent = message;
            });
            const firstInvalid = form.querySelector('[aria-invalid="true"]');
            if (firstInvalid?.classList.contains('native-select-source')) firstInvalid.closest('.styled-select')?.querySelector('.styled-select-trigger').focus();
            else if (firstInvalid?.classList.contains('native-date-source')) firstInvalid.closest('.date-picker')?.querySelector('.date-picker-trigger').focus();
            else if (firstInvalid) firstInvalid.focus();
        },
        open(task, dueDate) {
            const form = document.getElementById('task-form');
            this.editingId = task ? task.id : null;
            this.clearErrors();
            form.reset();
            form.elements.title.value = task ? task.title || '' : '';
            form.elements.priority.value = String(task ? task.priority || 2 : 2);
            form.elements.due_date.value = task ? task.due_date || '' : dueDate || components.today();
            datePicker.sync(form.elements.due_date);
            form.elements.description.value = task ? task.description || '' : '';
            this.setEditorCode(this.sanitize(task && task.description || ''));
            const select = form.elements.project_id;
            select.replaceChildren(...state.projects.map((project) => {
                const option = document.createElement('option');
                option.value = String(project.id); option.textContent = project.name;
                return option;
            }));
            const preferred = task ? task.project_id : state.projects[0]?.id;
            if (preferred != null) select.value = String(preferred);
            dropdowns.sync(select);
            document.getElementById('task-panel-title').textContent = task ? 'Upraviť úlohu' : 'Nová úloha';
            document.querySelector('.task-delete-button').hidden = !task;
            ui.openPanel('task-panel');
        },
        async save(button) {
            const form = document.getElementById('task-form');
            this.clearErrors();
            const title = form.elements.title.value.trim();
            const description = this.sanitize(this.getEditorCode());
            const data = {
                title, project_id: Number(form.elements.project_id.value),
                priority: Number(form.elements.priority.value), due_date: form.elements.due_date.value,
                description: description || null
            };
            const fields = {};
            if (!title || title.length > 150) fields.title = 'Názov musí mať 1 až 150 znakov.';
            if (!data.project_id) fields.project_id = 'Vyber projekt.';
            if (!data.due_date || !/^\d{4}-\d{2}-\d{2}$/.test(data.due_date)) fields.due_date = 'Vyber platný termín.';
            if (description.length > 2000) fields.description = 'Popis môže mať najviac 2 000 znakov.';
            if (Object.keys(fields).length) return this.showErrors(fields);
            form.elements.description.value = data.description || '';
            button.disabled = true;
            try {
                const savedTask = await api.request(this.editingId ? 'PATCH' : 'POST', this.editingId ? `/api/tasks/${this.editingId}` : '/api/tasks', data);
                if (savedTask) {
                    const savedIndex = state.tasks.findIndex((task) => String(task.id) === String(savedTask.id));
                    if (savedIndex === -1) state.tasks.push(savedTask);
                    else state.tasks[savedIndex] = savedTask;
                }
                ui.closePanels();
                const route = router.current();
                if (route.name === 'tasks') await views.loadTasks(state.routeSequence);
                else if (route.name === 'project') {
                    const project = state.projects.find((item) => Number(item.id) === Number(route.id));
                    if (project) projectManager.renderDetail(project);
                }
                if (route.name === 'calendar') views.reloadCalendar();
                ui.showToast(this.editingId ? 'Úloha bola upravená.' : 'Úloha bola vytvorená.');
            } catch (error) {
                if (error.status === 422) this.showErrors(error.fields);
                else ui.showToast(error.message || 'Úlohu sa nepodarilo uložiť.', 'error');
            } finally { button.disabled = false; }
        },
        async remove(button) {
            const taskId = button.dataset.taskId || this.editingId;
            if (!taskId) return;
            if (!await ui.confirm('Naozaj chceš odstrániť túto úlohu?', 'Odstrániť úlohu?', 'Odstrániť')) return;
            button.disabled = true;
            try {
                await api.request('DELETE', `/api/tasks/${taskId}`);
                ui.closePanels();
                this.editingId = null;
                state.tasks = state.tasks.filter((task) => String(task.id) !== String(taskId));
                const route = router.current();
                if (route.name === 'tasks') await views.loadTasks(state.routeSequence);
                else if (route.name === 'project') {
                    const project = state.projects.find((item) => Number(item.id) === Number(route.id));
                    if (project) projectManager.renderDetail(project);
                }
                ui.showToast('Úloha bola odstránená.');
            } catch (error) { ui.showToast(error.message || 'Úlohu sa nepodarilo odstrániť.', 'error'); }
            finally { button.disabled = false; }
        }
    };

    /* Projekty používajú spoločný stav s úlohami, aby sa počty a limit nemenili medzi obrazovkami. */
    const projectManager = {
        icons: { briefcase: '💼', house: '🏠', book: '🎓', idea: '💡', target: '🎯', pin: '📌' },
        colors: ['#6558d3', '#e28a42', '#4188c7', '#45a875', '#c45678', '#8a71d8', '#4e9b9b', '#bd9a36'],
        editingId: null,
        limitReached() {
            return state.user?.plan !== 'premium' && state.projects.length >= 3;
        },
        explainLimit() {
            ui.showToast('Plán Standard povoľuje najviac 3 projekty. Na vytvorenie ďalšieho projektu potrebuješ plán Premium.', 'error');
        },
        updateCreateButtons() {
            const blocked = this.limitReached();
            const explanation = document.getElementById('project-limit-sidebar');
            if (explanation) {
                explanation.hidden = !blocked;
                explanation.textContent = blocked ? 'Plán Standard povoľuje 3 projekty. Ďalší projekt je dostupný v Premium.' : '';
            }
            document.querySelectorAll('[data-action="project-open"]').forEach((button) => {
                /* Klik zostáva dostupný, aby aplikácia vedela povedať, prečo projekt nevytvorí. */
                button.disabled = false;
                button.classList.toggle('is-limit-reached', blocked);
                button.title = blocked ? 'Plán Standard povoľuje najviac 3 projekty. Ďalší projekt vyžaduje Premium.' : '';
            });
        },
        renderSidebar() {
            const list = document.getElementById('sidebar-project-list');
            if (!list) return;
            list.replaceChildren();
            state.projects.forEach((project) => {
                const link = document.createElement('a');
                link.className = 'project-link'; link.href = `#project-${encodeURIComponent(project.id)}`;
                link.dataset.action = 'navigate';
                const icon = document.createElement('span'); icon.className = 'project-link-icon'; icon.setAttribute('aria-hidden', 'true'); icon.textContent = this.icons[project.icon] || '📁';
                const name = document.createElement('span'); name.className = 'project-link-name'; name.textContent = project.name;
                const count = document.createElement('span'); count.className = 'project-count'; count.textContent = String(Number(project.task_count) || 0);
                link.append(icon, name, count); list.append(link);
            });
            this.updateCreateButtons();
        },
        counts(project) {
            const tasks = state.tasks.filter((task) => Number(task.project_id) === Number(project.id));
            const total = Number(project.task_count) || tasks.length;
            const done = Number(project.done_count) || (tasks.length ? tasks.filter((task) => task.is_done).length : 0);
            return { total, done, open: Math.max(0, total - done) };
        },
        renderList() {
            const list = document.getElementById('project-list');
            const notice = document.getElementById('project-limit-notice');
            this.updateCreateButtons();
            if (!list) return;
            list.replaceChildren();
            const standard = state.user?.plan !== 'premium';
            if (notice) {
                notice.hidden = !standard;
                notice.textContent = standard ? `Plán Standard umožňuje najviac 3 projekty. Používaš ${state.projects.length} z 3.` : 'Plán Premium umožňuje vytvárať neobmedzený počet projektov.';
                notice.classList.toggle('is-limit-reached', standard && state.projects.length >= 3);
            }
            if (!state.projects.length) {
                const empty = document.createElement('p'); empty.className = 'project-empty'; empty.textContent = 'Zatiaľ nemáš žiadny projekt. Vytvor si prvý a začni si organizovať úlohy.'; list.append(empty); return;
            }
            state.projects.forEach((project) => {
                const counts = this.counts(project);
                const card = document.createElement('article'); card.className = 'project-card'; card.style.setProperty('--project-color', project.color || this.colors[0]);
                const open = document.createElement('a'); open.className = 'project-card-main'; open.href = `#project-${encodeURIComponent(project.id)}`; open.dataset.action = 'navigate';
                const icon = document.createElement('span'); icon.className = 'project-card-icon'; icon.setAttribute('aria-hidden', 'true'); icon.textContent = this.icons[project.icon] || '📁';
                const title = document.createElement('span'); title.className = 'project-card-title'; title.textContent = project.name;
                const desc = document.createElement('span'); desc.className = 'project-card-description'; desc.textContent = project.description || 'Bez popisu';
                open.append(icon, title, desc);
                const stats = document.createElement('div'); stats.className = 'project-card-stats'; stats.textContent = `${counts.done} z ${counts.total} hotových`;
                const progress = document.createElement('progress'); progress.max = counts.total || 1; progress.value = counts.done; progress.setAttribute('aria-label', `Priebeh projektu ${project.name}`);
                const edit = document.createElement('button'); edit.className = 'project-edit'; edit.type = 'button'; edit.dataset.action = 'project-edit'; edit.dataset.projectId = String(project.id); edit.textContent = 'Upraviť'; edit.setAttribute('aria-label', `Upraviť projekt ${project.name}`);
                card.append(open, stats, progress, edit); list.append(card);
            });
        },
        open(project) {
            if (!project && this.limitReached()) { this.explainLimit(); return; }
            const form = document.getElementById('project-form');
            if (!form) return;
            this.editingId = project ? Number(project.id) : null;
            form.reset(); form.querySelectorAll('.field-error').forEach((node) => { node.textContent = ''; });
            form.querySelectorAll('[aria-invalid="true"]').forEach((node) => node.removeAttribute('aria-invalid'));
            form.elements.name.value = project?.name || '';
            form.elements.description.value = project?.description || '';
            form.dataset.selectedIcon = project?.icon || 'briefcase';
            form.querySelectorAll('[data-project-icon]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.projectIcon === form.dataset.selectedIcon)));
            document.getElementById('project-panel-title').textContent = project ? 'Upraviť projekt' : 'Nový projekt';
            const remove = document.querySelector('[data-action="project-delete"]');
            remove.hidden = !project; remove.disabled = state.projects.length <= 1;
            remove.title = state.projects.length <= 1 ? 'Posledný projekt nemožno odstrániť.' : '';
            ui.openPanel('project-panel');
        },
        async save(button) {
            /* Limit kontrolujeme aj pri odoslaní, aby ho neobišiel otvorený alebo zastaraný formulár. */
            if (!this.editingId && this.limitReached()) { ui.closePanels(); this.explainLimit(); return; }
            const form = document.getElementById('project-form');
            const name = form.elements.name.value.trim();
            const description = form.elements.description.value.trim();
            const fields = {};
            if (!name || name.length > 40) fields.name = 'Názov musí mať 1 až 40 znakov.';
            if (description.length > 200) fields.description = 'Popis môže mať najviac 200 znakov.';
            form.querySelectorAll('.field-error').forEach((node) => { node.textContent = ''; });
            form.querySelectorAll('[aria-invalid="true"]').forEach((node) => node.removeAttribute('aria-invalid'));
            Object.entries(fields).forEach(([key, message]) => { form.elements[key].setAttribute('aria-invalid', 'true'); document.getElementById(`project-${key}-error`).textContent = message; });
            if (Object.keys(fields).length) { form.elements[Object.keys(fields)[0]].focus(); return; }
            const payload = { name, description, icon: form.dataset.selectedIcon || 'briefcase' };
            button.disabled = true;
            try {
                const saved = await api.request(this.editingId ? 'PATCH' : 'POST', this.editingId ? `/api/projects/${this.editingId}` : '/api/projects', payload);
                const existingIndex = state.projects.findIndex((item) => Number(item.id) === this.editingId);
                const idUsed = saved && state.projects.some((item) => Number(item.id) === Number(saved.id) && Number(item.id) !== this.editingId);
                const fallbackId = this.editingId || (Math.max(0, ...state.projects.map((item) => Number(item.id) || 0)) + 1);
                const returnedColorIsUsed = saved?.color && state.projects.some((item) => item.color === saved.color && Number(item.id) !== this.editingId);
                const project = { ...(existingIndex >= 0 ? state.projects[existingIndex] : {}), ...(saved || {}), ...payload, id: idUsed || !saved?.id ? fallbackId : saved.id, color: saved?.color && !returnedColorIsUsed ? saved.color : state.projects[existingIndex]?.color || this.colors[state.projects.length % this.colors.length], task_count: saved?.task_count ?? state.projects[existingIndex]?.task_count ?? 0, done_count: saved?.done_count ?? state.projects[existingIndex]?.done_count ?? 0 };
                if (existingIndex >= 0) state.projects[existingIndex] = project; else state.projects.push(project);
                this.renderSidebar(); ui.closePanels(); this.renderList();
                if (router.current().name === 'project' && Number(router.current().id) === Number(project.id)) this.renderDetail(project);
                ui.showToast(this.editingId ? 'Projekt bol upravený.' : 'Projekt bol vytvorený.');
            } catch (error) {
                if (error.status === 422) Object.entries(error.fields || {}).forEach(([key, message]) => { const input = form.elements[key]; if (input) input.setAttribute('aria-invalid', 'true'); const target = document.getElementById(`project-${key}-error`); if (target) target.textContent = message; });
                else ui.showToast(error.message || 'Projekt sa nepodarilo uložiť.', 'error');
            } finally { button.disabled = false; }
        },
        async remove(button) {
            const project = state.projects.find((item) => Number(item.id) === this.editingId);
            if (!project || state.projects.length <= 1) return;
            const count = this.counts(project).total;
            const message = `Projekt „${project.name}“ obsahuje ${count} ${count === 1 ? 'úlohu' : count >= 2 && count <= 4 ? 'úlohy' : 'úloh'}. Zmazaním projektu sa odstránia aj tieto úlohy. Pokračovať?`;
            if (!await ui.confirm(message, 'Odstrániť projekt?', 'Pokračovať')) return;
            button.disabled = true;
            try {
                await api.request('DELETE', `/api/projects/${project.id}`);
                state.projects = state.projects.filter((item) => Number(item.id) !== Number(project.id));
                state.tasks = state.tasks.filter((task) => Number(task.project_id) !== Number(project.id));
                this.renderSidebar(); ui.closePanels();
                if (router.current().name === 'project') window.location.hash = 'projects'; else this.renderList();
                ui.showToast('Projekt a jeho úlohy boli odstránené.');
            } catch (error) { ui.showToast(error.code === 'last_project' ? 'Posledný projekt nemožno odstrániť.' : error.message || 'Projekt sa nepodarilo odstrániť.', 'error'); }
            finally { button.disabled = false; }
        },
        renderDetail(project, members = state.projectMembers) {
            const root = document.getElementById('project-detail-view'); if (!root) return;
            const counts = this.counts(project);
            root.replaceChildren();
            const back = document.createElement('a'); back.href = '#projects'; back.dataset.action = 'navigate'; back.className = 'project-back'; back.textContent = '← Všetky projekty'; root.append(back);
            const head = document.createElement('div'); head.className = 'project-detail-heading'; head.style.setProperty('--project-color', project.color || this.colors[0]);
            const icon = document.createElement('span'); icon.className = 'project-card-icon'; icon.textContent = this.icons[project.icon] || '📁'; icon.setAttribute('aria-hidden', 'true');
            const text = document.createElement('div'); const title = document.createElement('h2'); title.textContent = project.name; const desc = document.createElement('p'); desc.textContent = project.description || 'Bez popisu'; text.append(title, desc);
            const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'button button-primary'; edit.dataset.action = 'project-edit'; edit.dataset.projectId = String(project.id); edit.textContent = 'Upraviť projekt'; head.append(icon, text, edit); root.append(head);
            const summary = document.createElement('p'); summary.className = 'project-detail-summary'; summary.textContent = `${counts.open} otvorených · ${counts.done} hotových z ${counts.total} úloh`; root.append(summary);
            // Checkboxy sú zatiaľ iba náhľad serverových práv; ich editovanie patrí do kroku 2.
            const memberSection = document.createElement('section'); memberSection.className = 'task-section project-members';
            const memberHeading = document.createElement('h3'); memberHeading.className = 'project-task-heading'; memberHeading.textContent = `Členovia projektu (${members.length})`; memberSection.append(memberHeading);
            const permissionGroups = [
                ['Projekt', [
                    [['can_manage_project'], 'Spravovať projekt'],
                    [['can_manage_members'], 'Spravovať členov']
                ]],
                ['Úlohy', [
                    [['can_add_tasks'], 'Pridávať úlohy'],
                    [['can_complete_tasks'], 'Dokončiť úlohy'],
                    [['can_edit_other_tasks'], 'Upraviť úlohy ostatných'],
                    [['can_delete_other_tasks'], 'Zmazať úlohy ostatných']
                ]],
                ['Komentáre', [
                    [['can_add_comments'], 'Pridávať komentáre'],
                    [['can_delete_other_comments'], 'Zmazať komentáre ostatných']
                ]]
            ];
            const memberList = document.createElement('div'); memberList.className = 'project-member-list';
            if (!members.length) {
                const empty = document.createElement('p'); empty.className = 'project-empty'; empty.textContent = 'V projekte zatiaľ nie sú žiadni členovia.'; memberList.append(empty);
            }
            members.forEach((member) => {
                const item = document.createElement('details'); item.className = 'project-member';
                const summaryRow = document.createElement('summary'); summaryRow.className = 'project-member-summary';
                const identity = document.createElement('span'); identity.className = 'project-member-identity';
                const name = document.createElement('strong'); name.textContent = member.name;
                const email = document.createElement('span'); email.className = 'project-member-email'; email.textContent = member.email;
                identity.append(name, email);
                const meta = document.createElement('span'); meta.className = 'project-member-meta';
                const role = document.createElement('span'); role.className = 'project-member-role'; role.textContent = member.is_owner ? 'Vlastník' : 'Člen';
                const added = document.createElement('span'); added.className = 'project-member-added'; added.textContent = `Pridaný ${member.added_at ? new Date(member.added_at).toLocaleDateString('sk-SK') : '—'}`;
                meta.append(role, added); summaryRow.append(identity, meta); item.append(summaryRow);
                const permissionPanel = document.createElement('div'); permissionPanel.className = 'project-member-permissions';
                permissionGroups.forEach(([groupName, permissions]) => {
                    const group = document.createElement('fieldset'); group.className = 'project-permission-group';
                    const legend = document.createElement('legend'); legend.textContent = groupName; group.append(legend);
                    permissions.forEach(([keys, label]) => {
                        const permission = document.createElement('label'); permission.className = 'project-permission';
                        const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.disabled = true;
                        const enabledCount = keys.filter((key) => Boolean(member.permissions?.[key])).length;
                        checkbox.checked = enabledCount === keys.length;
                        checkbox.indeterminate = enabledCount > 0 && enabledCount < keys.length;
                        if (keys.length > 1) {
                            checkbox.title = checkbox.indeterminate ? `${label} – povolené iba pre vlastné alebo cudzie záznamy` : `${label} – vlastné aj cudzie záznamy`;
                            checkbox.setAttribute('aria-label', checkbox.title);
                        }
                        const text = document.createElement('span'); text.textContent = label;
                        permission.append(checkbox, text); group.append(permission);
                    });
                    permissionPanel.append(group);
                });
                item.append(permissionPanel); memberList.append(item);
            });
            memberSection.append(memberList); root.append(memberSection);
            const openTasks = state.tasks.filter((task) => Number(task.project_id) === Number(project.id) && !task.is_done);
            const doneTasks = state.tasks.filter((task) => Number(task.project_id) === Number(project.id) && task.is_done);
            [["Otvorené", openTasks], ["Hotové", doneTasks]].forEach(([label, tasks]) => {
                const section = document.createElement('section'); section.className = 'task-section'; const h = document.createElement('h3'); h.className = 'project-task-heading'; h.textContent = `${label} (${tasks.length})`; section.append(h);
                if (tasks.length) tasks.forEach((task) => section.append(taskList.makeCard(task, new Map(state.projects.map((item) => [Number(item.id), item])))));
                else { const empty = document.createElement('p'); empty.className = 'project-empty'; empty.textContent = label === 'Otvorené' ? 'V tomto projekte nie sú otvorené úlohy.' : 'Zatiaľ tu nie sú hotové úlohy.'; section.append(empty); }
                root.append(section);
            });
        }
    };

    const views = {
        calendar: null,
        calendarSequence: 0,
        async loadSidebarProjects(routeSequence) {
            try {
                const projects = await api.request('GET', '/api/projects');
                if (routeSequence !== state.routeSequence) return;
                state.projects = Array.isArray(projects) ? projects : [];
                projectManager.renderSidebar();
            } catch (error) {
                if (routeSequence === state.routeSequence) {
                    ui.showToast(error.message || 'Projekty sa nepodarilo načítať.', 'error');
                }
            }
        },
        async loadInsights(routeSequence, name) {
            const target = document.getElementById('view');
            if (!target) return;
            if (name === 'calendar') {
                target.innerHTML = `<div class="page-heading"><div><p class="eyebrow">TASKO</p><h1 id="page-title">Kalendár</h1><p class="page-subtitle">Termíny a úlohy podľa dní.</p></div></div><section class="calendar-card" aria-label="Kalendár úloh"><div id="task-calendar" aria-label="Kalendár"></div></section><section class="task-section calendar-day-section" aria-labelledby="calendar-day-heading"><div class="section-heading"><h2 id="calendar-day-heading">Vybraný deň</h2><span id="calendar-day-count" class="section-count"></span></div><div id="calendar-day-tasks" aria-live="polite"><div class="task-skeleton" aria-hidden="true"></div></div></section>`;
                const calendarRoot = document.getElementById('task-calendar');
                if (!window.FullCalendar || !calendarRoot) {
                    calendarRoot.textContent = 'Kalendár sa nepodarilo načítať.';
                    return;
                }
                const locale = {
                    code: 'sk', week: { dow: 1, doy: 4 },
                    buttonText: { prev: 'Predchádzajúci mesiac', next: 'Nasledujúci mesiac', today: 'Dnes', month: 'Mesiac', week: 'Týždeň', day: 'Deň', list: 'Zoznam' },
                    // FullCalendar 6 formátuje názvy dní a mesiacov podľa locale kódu cez Intl.
                    allDayText: 'Celý deň', moreLinkText: 'ďalšie', noEventsText: 'Žiadne úlohy'
                };
                this.calendar = new FullCalendar.Calendar(calendarRoot, {
                    initialView: 'dayGridMonth', locale, firstDay: 1, height: 'auto', dayMaxEvents: 3,
                    headerToolbar: { left: 'prev,next today', center: 'title', right: '' },
                    events: [],
                    datesSet: (info) => {
                        this.updateTodayButton(info.view);
                        this.loadCalendarRange(info, routeSequence);
                    },
                    dateClick: (info) => this.openCalendarDay(info.dateStr),
                    eventClick: (info) => {
                        const task = state.tasks.find((item) => String(item.id) === String(info.event.id));
                        if (task) taskList.showDetail(task);
                    },
                    dayCellClassNames: (info) => {
                        const date = components.localDateStr(info.date);
                        return date < components.today() && state.tasks.some((task) => task.due_date === date && !task.is_done) ? ['has-overdue-task'] : [];
                    },
                    dayCellDidMount: (info) => {
                        const date = components.localDateStr(info.date);
                        const count = state.tasks.filter((task) => task.due_date === date).length;
                        if (count) info.el.setAttribute('aria-label', `${date}, ${count} ${count === 1 ? 'úloha' : 'úloh'}`);
                    }
                });
                this.calendar.render();
                const today = components.today();
                this.selectCalendarDay(today);
                return;
            }
            if (name === 'done') {
                target.innerHTML = `<div class="page-heading"><div><p class="eyebrow">TASKO</p><h1 id="page-title">Hotové úlohy</h1><p class="page-subtitle">Dokončené úlohy na jednom mieste.</p></div><button class="button button-danger" type="button" data-action="completed-clear">Zmazať všetky hotové</button></div><section class="task-section"><div id="completed-task-list" aria-live="polite"><div class="task-skeleton" aria-hidden="true"></div><div class="task-skeleton" aria-hidden="true"></div></div></section>`;
            } else {
                target.innerHTML = `<div class="page-heading"><div><p class="eyebrow">TASKO</p><h1 id="page-title">Štatistiky</h1><p class="page-subtitle">Prehľad dokončených úloh a priebehu projektov.</p></div></div><div id="task-statistics" class="statistics-grid" aria-live="polite"><div class="statistic-skeleton"></div><div class="statistic-skeleton"></div><div class="statistic-skeleton"></div></div><section class="task-section"><h2 class="statistics-project-heading">Priebeh projektov</h2><div id="project-statistics" class="statistics-project-list"></div></section>`;
            }
            try {
                // Projekty sú dostupné už vo fáze B5, aj keď API úloh ešte nie je hotové.
                const [tasksResult, projectsResult] = await Promise.allSettled([
                    api.request('GET', '/api/tasks'),
                    api.request('GET', '/api/projects')
                ]);
                if (routeSequence !== state.routeSequence) return;
                if (projectsResult.status === 'fulfilled') {
                    state.projects = Array.isArray(projectsResult.value) ? projectsResult.value : [];
                    projectManager.renderSidebar();
                }
                if (tasksResult.status === 'rejected') throw tasksResult.reason;
                state.tasks = Array.isArray(tasksResult.value) ? tasksResult.value : [];
                projectManager.renderSidebar();
                if (name === 'done') this.renderCompleted();
                else this.renderStatistics();
            } catch (error) {
                if (routeSequence !== state.routeSequence) return;
                const node = document.getElementById(name === 'done' ? 'completed-task-list' : 'task-statistics');
                if (node) node.textContent = error.message || 'Údaje sa nepodarilo načítať.';
            }
        },
        async loadCalendarRange(info, routeSequence) {
            const sequence = ++this.calendarSequence;
            // FullCalendar dáva koniec rozsahu ako exkluzívny dátum; API kontrakt prijíma obe hranice vrátane.
            const end = components.addDays(info.endStr.slice(0, 10), -1);
            try {
                const [tasksResult, projectsResult] = await Promise.allSettled([
                    api.request('GET', `/api/tasks?from=${encodeURIComponent(info.startStr.slice(0, 10))}&to=${encodeURIComponent(end)}`),
                    api.request('GET', '/api/projects')
                ]);
                if (sequence !== this.calendarSequence || routeSequence !== state.routeSequence || router.current().name !== 'calendar') return;
                if (projectsResult.status === 'fulfilled') {
                    state.projects = Array.isArray(projectsResult.value) ? projectsResult.value : [];
                    projectManager.renderSidebar();
                }
                if (tasksResult.status === 'rejected') throw tasksResult.reason;
                state.tasks = Array.isArray(tasksResult.value) ? tasksResult.value : [];
                projectManager.renderSidebar();
                this.calendar.removeAllEvents();
                state.tasks.filter((task) => task.due_date && !task.is_done).forEach((task) => {
                    const project = state.projects.find((item) => Number(item.id) === Number(task.project_id));
                    const priority = Math.min(4, Math.max(1, Number(task.priority) || 2));
                    const colors = { 1: '#777b8b', 2: '#4285d4', 3: '#d8902e', 4: '#d95359' };
                    this.calendar.addEvent({ id: String(task.id), title: task.title, start: task.due_date, allDay: true, backgroundColor: colors[priority], borderColor: project?.color || colors[priority], textColor: '#fff' });
                });
                this.calendar.render();
                this.selectCalendarDay(document.getElementById('calendar-day-heading')?.dataset.date || components.today());
            } catch (error) {
                if (sequence !== this.calendarSequence) return;
                const list = document.getElementById('calendar-day-tasks');
                if (list) list.textContent = error.message || 'Úlohy kalendára sa nepodarilo načítať.';
            }
        },
        selectCalendarDay(date) {
            const heading = document.getElementById('calendar-day-heading');
            const list = document.getElementById('calendar-day-tasks');
            if (!heading || !list) return;
            heading.dataset.date = date;
            heading.textContent = new Intl.DateTimeFormat('sk', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
            const tasks = state.tasks.filter((task) => task.due_date === date);
            document.getElementById('calendar-day-count').textContent = `${tasks.length} ${tasks.length === 1 ? 'úloha' : 'úloh'}`;
            list.replaceChildren();
            if (!tasks.length) { const empty = document.createElement('p'); empty.className = 'task-empty'; empty.textContent = 'Na tento deň nie sú naplánované žiadne úlohy.'; list.append(empty); return; }
            const projects = new Map(state.projects.map((project) => [Number(project.id), project]));
            tasks.forEach((task) => list.append(taskList.makeCard(task, projects)));
        },
        updateTodayButton(view) {
            const button = document.querySelector('#task-calendar .fc-today-button');
            if (!button) return;
            const displayedMonth = components.localDateStr(view.currentStart).slice(0, 7);
            button.hidden = displayedMonth === components.today().slice(0, 7);
        },
        openCalendarDay(date) {
            this.selectCalendarDay(date);
            const task = state.tasks.find((item) => item.due_date === date);
            // Prázdny deň preskočí medzikrok; pri obsadenom dni sa otvorí úloha a pridanie ostane dostupné v detaile.
            if (task) taskList.showDetail(task);
            else taskForm.open(null, date);
        },
        reloadCalendar() {
            if (!this.calendar || router.current().name !== 'calendar') return;
            const view = this.calendar.view;
            this.loadCalendarRange({ startStr: components.localDateStr(view.activeStart), endStr: components.localDateStr(view.activeEnd) }, state.routeSequence);
        },
        renderCompleted() {
            const list = document.getElementById('completed-task-list');
            if (!list) return;
            const tasks = state.tasks.filter((task) => task.is_done);
            list.replaceChildren();
            if (!tasks.length) { const empty = document.createElement('p'); empty.className = 'task-empty'; empty.textContent = 'Zatiaľ nemáš hotové úlohy.'; list.append(empty); }
            else { const projects = new Map(state.projects.map((project) => [Number(project.id), project])); tasks.forEach((task) => list.append(taskList.makeCard(task, projects))); }
        },
        renderStatistics() {
            const total = state.tasks.length;
            const done = state.tasks.filter((task) => task.is_done).length;
            const open = total - done;
            const cards = document.getElementById('task-statistics');
            if (!cards) return;
            cards.replaceChildren();
            [['Všetky úlohy', total], ['Otvorené úlohy', open], ['Dokončené úlohy', done]].forEach(([label, value]) => {
                const card = document.createElement('article'); card.className = 'summary-card statistic-card';
                const number = document.createElement('strong'); number.textContent = String(value);
                const caption = document.createElement('span'); caption.textContent = label;
                const content = document.createElement('div'); content.className = 'statistic-card-content';
                content.append(number, caption); card.append(content); cards.append(card);
            });
            const list = document.getElementById('project-statistics');
            list.replaceChildren();
            state.projects.forEach((project) => {
                const tasks = state.tasks.filter((task) => Number(task.project_id) === Number(project.id));
                const completed = tasks.filter((task) => task.is_done).length;
                const row = document.createElement('div'); row.className = 'statistics-project-row';
                const name = document.createElement('span'); name.textContent = project.name;
                const count = document.createElement('span'); count.textContent = `${completed} z ${tasks.length} hotových`;
                const progress = document.createElement('progress'); progress.max = tasks.length || 1; progress.value = completed; progress.setAttribute('aria-label', `Priebeh projektu ${project.name}`);
                row.append(name, count, progress); list.append(row);
            });
            if (!state.projects.length) list.textContent = 'Zatiaľ nemáš projekty.';
        },
        async clearCompleted(button) {
            const count = state.tasks.filter((task) => task.is_done).length;
            if (!count) { ui.showToast('Nemáš žiadne hotové úlohy.', 'info'); return; }
            if (!await ui.confirm(`Naozaj chceš zmazať ${count} hotových ${count === 1 ? 'úlohu' : 'úloh'}?`, 'Zmazať hotové úlohy?', 'Zmazať všetky')) return;
            button.disabled = true;
            try {
                await api.request('DELETE', '/api/tasks/completed');
                state.tasks = state.tasks.filter((task) => !task.is_done);
                this.renderCompleted();
                ui.showToast('Hotové úlohy boli zmazané.', 'success');
            } catch (error) { ui.showToast(error.message || 'Hotové úlohy sa nepodarilo zmazať.', 'error'); }
            finally { button.disabled = false; }
        },
        async loadTasks(routeSequence) {
            const requestSequence = ++taskList.requestSequence;
            taskList.loading();
            const [tasksResult, projectsResult] = await Promise.allSettled([
                api.request('GET', '/api/tasks'),
                api.request('GET', '/api/projects')
            ]);
            if (requestSequence !== taskList.requestSequence || routeSequence !== state.routeSequence) return;
            if (projectsResult.status === 'fulfilled') {
                state.projects = Array.isArray(projectsResult.value) ? projectsResult.value : [];
                projectManager.renderSidebar();
            }
            if (tasksResult.status === 'rejected') {
                taskList.error(tasksResult.reason);
                return;
            }
            state.tasks = Array.isArray(tasksResult.value) ? tasksResult.value : [];
            notifications.update();
            taskList.render(state.tasks, new Map(state.projects.map((project) => [Number(project.id), project])));
        },
        async loadProjects(routeSequence, route) {
            try {
                const projects = await api.request('GET', '/api/projects');
                if (routeSequence !== state.routeSequence) return;
                state.projects = Array.isArray(projects) ? projects : [];
                projectManager.renderSidebar();
                if (route.name === 'projects') projectManager.renderList();
                else {
                    state.projectMembers = [];
                    // Úlohy detailu projektu načítajú samostatne; zoznam projektov funguje už vo fáze B5.
                    try {
                        const tasks = await api.request('GET', '/api/tasks');
                        if (routeSequence === state.routeSequence) state.tasks = Array.isArray(tasks) ? tasks : [];
                    } catch (_) {
                        if (routeSequence !== state.routeSequence) return;
                        state.tasks = [];
                    }
                    if (routeSequence !== state.routeSequence) return;
                    notifications.update();
                    const cached = state.projects.find((item) => String(item.id) === String(route.id));
                    if (!cached) { document.getElementById('project-detail-view').textContent = 'Projekt sa nenašiel.'; return; }
                    const [detail, tasks, members] = await Promise.all([
                        api.request('GET', `/api/projects/${encodeURIComponent(route.id)}`),
                        api.request('GET', `/api/tasks?project_id=${encodeURIComponent(route.id)}`),
                        api.request('GET', `/api/projects/${encodeURIComponent(route.id)}/members`)
                    ]);
                    if (routeSequence === state.routeSequence) {
                        state.projectMembers = Array.isArray(members) ? members : [];
                        state.tasks = Array.isArray(tasks) ? tasks : state.tasks;
                        projectManager.renderDetail(detail || cached, state.projectMembers);
                    }
                }
            } catch (error) {
                const target = document.getElementById(route.name === 'projects' ? 'project-list' : 'project-detail-view');
                if (target) { target.replaceChildren(); const message = document.createElement('p'); message.className = 'project-empty'; message.textContent = error.message || 'Projekty sa nepodarilo načítať.'; target.append(message); }
            }
        },
        init() {
            /* Po obnovení sa stav obnoví zo serverovej session, nie z localStorage. */
            document.body.classList.add('auth-checking');
            api.request('GET', '/api/me').then((user) => {
                state.user = user;
                profile.render();
            }).catch((error) => {
                if (error.status !== 401) ui.showToast('Nepodarilo sa overiť prihlásenie. Skús to znova.', 'error');
                state.user = null;
            }).finally(() => {
                state.authReady = true;
                document.body.classList.remove('auth-checking');
                router.navigate();
                const route = router.current();
                const first = document.querySelector(route.name === 'register' ? '#register-name' : '#login-email');
                if (!state.user && first) first.focus();
            });
            window.addEventListener('hashchange', () => router.navigate());
        }
    };

    /* Chyby API sa priradia ku konkrétnemu poľu; formulár ostane použiteľný aj pri všeobecnej chybe. */
    const auth = {
        clearErrors(form) {
            form.querySelectorAll('.field-error').forEach((node) => { node.textContent = ''; });
            form.querySelectorAll('[aria-invalid="true"]').forEach((node) => node.removeAttribute('aria-invalid'));
            const summary = form.querySelector('.form-error');
            if (summary) summary.textContent = '';
        },
        showErrors(form, fields) {
            Object.entries(fields || {}).forEach(([name, message]) => {
                const input = form.querySelector(`[name="${name}"]`);
                if (!input) return;
                input.setAttribute('aria-invalid', 'true');
                const error = form.querySelector(`#${form.id.replace('-form', '')}-${name.replaceAll('_', '-')}-error`);
                if (error) error.textContent = message;
            });
        },
        setBusy(form, busy) {
            const button = form.querySelector('[type="submit"]');
            if (button) button.disabled = busy;
            form.setAttribute('aria-busy', String(busy));
        },
        submit(form) {
            this.clearErrors(form);
            const nameInput = form.querySelector('[name="name"]');
            if (nameInput) nameInput.setCustomValidity(nameInput.value.trim() ? '' : 'Zadaj svoje meno.');
            if (!form.reportValidity()) return;
            const values = Object.fromEntries(new FormData(form).entries());
            if (form.id === 'register-form' && values.password !== values.password_confirm) {
                this.showErrors(form, { password_confirm: 'Heslá sa nezhodujú.' });
                form.elements.password_confirm.focus();
                return;
            }
            const isRegister = form.id === 'register-form';
            const payload = isRegister
                ? { name: values.name.trim(), email: values.email.trim(), password: values.password }
                : { email: values.email.trim(), password: values.password };
            this.setBusy(form, true);
            api.request('POST', isRegister ? '/api/auth/register' : '/api/auth/login', payload)
                .then((user) => {
                    state.user = user;
                    state.authReady = true;
                    profile.render();
                    window.location.hash = 'tasks';
                    router.navigate();
                })
                .catch((error) => {
                    if (error.status === 401) {
                        const summary = form.querySelector('.form-error');
                        if (summary) summary.textContent = 'Nesprávny e-mail alebo heslo.';
                    } else if (error.status === 409 && error.code === 'email_taken') {
                        this.showErrors(form, { email: 'Účet s týmto e-mailom už existuje.' });
                        form.elements.email.focus();
                    } else if (error.status === 422) {
                        this.showErrors(form, error.fields);
                        const firstInvalid = form.querySelector('[aria-invalid="true"]');
                        if (firstInvalid) firstInvalid.focus();
                        else if (form.querySelector('.form-error')) form.querySelector('.form-error').textContent = error.message;
                    } else {
                        const summary = form.querySelector('.form-error');
                        if (summary) summary.textContent = error.message || 'Požiadavku sa nepodarilo dokončiť.';
                    }
                })
                .finally(() => this.setBusy(form, false));
        },
        logout(button) {
            button.disabled = true;
            ui.closePanels();
            api.request('POST', '/api/auth/logout', {}).catch(() => {
                ui.showToast('Odhlásenie zo servera sa nepodarilo.', 'error');
            }).finally(() => {
                state.user = null;
                state.authReady = true;
                window.location.hash = 'login';
                router.navigate();
                const email = document.getElementById('login-email');
                if (email) email.focus();
                button.disabled = false;
            });
        }
    };

    /* Delegované udalosti fungujú aj pre obsah, ktorý neskôr vykreslia pohľady. */
    $(document).on('click', '[data-action]', function (event) {
        const action = this.dataset.action;
        if (action === 'comments-retry') commentThreads.load(commentThreads.taskId);
        if (action === 'comment-reply') commentThreads.toggleReply(this);
        if (action === 'comment-delete') commentThreads.remove(this);
        if (action === 'menu-toggle') ui.openPanel('navigation-drawer');
        if (action === 'menu-close' || action === 'panel-close' || action === 'overlay-close') ui.closePanels();
        if (action === 'task-create') taskForm.open(null);
        if (action === 'calendar-add-task') { ui.closePanels(); taskForm.open(null, this.dataset.dueDate); }
        if (action === 'task-detail') {
            const task = state.tasks.find((item) => String(item.id) === this.closest('.task-card')?.dataset.taskId);
            if (task) taskList.showDetail(task);
        }
        if (action === 'task-edit') {
            const task = state.tasks.find((item) => String(item.id) === this.dataset.taskId);
            if (task && !task.is_done) { ui.closePanels(); taskForm.open(task); }
        }
        if (action === 'task-save') taskForm.save(this);
        if (action === 'task-delete') taskForm.remove(this);
        if (action === 'task-complete') {
            event.preventDefault();
            event.stopPropagation();
            taskList.complete(this);
        }
        if (action === 'tasks-retry') views.loadTasks(state.routeSequence);
        if (action === 'completed-clear') views.clearCompleted(this);
        if (action === 'project-open') projectManager.open(null);
        if (action === 'project-edit') {
            const project = state.projects.find((item) => Number(item.id) === Number(this.dataset.projectId));
            if (project) projectManager.open(project);
        }
        if (action === 'project-delete') projectManager.remove(this);
        if (action === 'project-save') projectManager.save(this);
        if (action === 'profile-open') { profile.render(); ui.openPanel('profile-panel'); }
        if (action === 'profile-save') profile.save(this);
        if (action === 'plan-toggle') profile.togglePlan(this);
        if (action === 'show-register') window.location.hash = 'register';
        if (action === 'show-login') window.location.hash = 'login';
        if (action === 'logout') auth.logout(this);
        if (action === 'navigate' && this.getAttribute('href')) ui.closePanels();
        if (action === 'notifications') notifications.show();
        if (action === 'notifications-close') {
            document.getElementById('notification-panel').hidden = true;
            document.querySelector('.notification-button').setAttribute('aria-expanded', 'false');
        }
        if (action === 'login-submit' || action === 'register-submit') {
            event.preventDefault();
            ui.showToast('Táto akcia bude dokončená v ďalšom kroku.');
        }
    });

    /* Kliknutie na voľnú časť karty otvorí detail; ovládací prvok stavu zostáva samostatný. */
    $(document).on('click', '.task-card', function (event) {
        if (event.target.closest('button')) return;
        const task = state.tasks.find((item) => String(item.id) === this.dataset.taskId);
        if (task) taskList.showDetail(task);
    });

    $(document).on('submit', '#login-form, #register-form', function (event) {
        event.preventDefault();
        auth.submit(this);
    });

    $(document).on('submit', '#task-form', function (event) {
        event.preventDefault();
        taskForm.save(this.querySelector('[type="submit"]'));
    });

    $(document).on('submit', '#project-form', function (event) {
        event.preventDefault();
        projectManager.save(document.querySelector('[type="submit"][form="project-form"]'));
    });

    $(document).on('submit', '.comment-form', function (event) {
        event.preventDefault();
        commentThreads.submit(this);
    });

    $(document).on('click', '[data-project-icon]', function () {
        const form = document.getElementById('project-form');
        form.dataset.selectedIcon = this.dataset.projectIcon;
        form.querySelectorAll('[data-project-icon]').forEach((button) => button.setAttribute('aria-pressed', String(button === this)));
    });
    $(document).on('change', '#theme-preference', function () {
        theme.set(this.value);
    });
    $(document).on('change', '#language-preference', function () { i18n.set(this.value); });

    $(document).on('keydown', (event) => {
        if (event.key === 'Escape' && !document.getElementById('confirm-dialog').open) ui.closePanels();
        if (event.key === 'Escape') {
            const panel = document.getElementById('notification-panel');
            if (panel && !panel.hidden) {
                panel.hidden = true;
                document.querySelector('.notification-button').setAttribute('aria-expanded', 'false');
            }
        }
    });

    window.Tasko = { i18n, api, state, router, ui, views, components, profile, theme, taskList, commentThreads };
    i18n.init();
    theme.init();
    // Demo údaje zobraz iba pri lokálnom mocku, aby sa neplietli so skutočným účtom.
    const demoLoginHint = document.getElementById('demo-login-hint');
    if (demoLoginHint) demoLoginHint.hidden = !Boolean((window.TASKO_CONFIG || {}).demoMode);
    taskForm.initEditor();
    i18n.apply();
    dropdowns.init(document);
    datePicker.init(document);
    views.init();
    notifications.update();
    notifications.scheduleMidnight();
}(window.jQuery, window, document));
