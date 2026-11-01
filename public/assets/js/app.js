/* Jadro drží spoločné pomocné moduly; ďalšie kroky naň nadviažu obrazovkami a formulármi. */
(function ($, window, document) {
    'use strict';

    const i18n = {
        sk: {
            all_tasks: 'Všetky úlohy', projects: 'Projekty', calendar: 'Kalendár',
            done: 'Hotové', stats: 'Štatistiky', settings: 'Nastavenia', project: 'Projekt',
            login: 'Prihlásenie', register: 'Registrácia'
        },
        t(key) { return this.sk[key] || key; },
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

    const state = { routeSequence: 0, user: null, projects: [], tasks: [], authReady: false };

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
                if (!this.tasksMarkup) this.tasksMarkup = view.innerHTML;
                if (route.name === 'tasks') view.innerHTML = this.tasksMarkup;
                else if (route.name === 'settings') {
                    view.innerHTML = `<div class="page-heading"><div><p class="eyebrow">TASKO</p><h1 id="page-title">${title}</h1><p class="page-subtitle">Prispôsob si vzhľad aplikácie.</p></div></div><section class="settings-card" aria-labelledby="appearance-heading"><h2 id="appearance-heading">Vzhľad</h2><p>Vyber, ako sa má Tasko zobrazovať.</p><label for="theme-preference">Farebný režim</label><select id="theme-preference"><option value="system">Automaticky podľa zariadenia</option><option value="light">Svetlý</option><option value="dark">Tmavý</option></select></section>`;
                    theme.apply();
                } else if (!page.auth) {
                    view.innerHTML = `<div class="page-heading"><div><p class="eyebrow">TASKO</p><h1>${title}</h1><p class="page-subtitle">Obsah tejto obrazovky sa pripravuje.</p></div></div>`;
                }
            }
            /* Nadpis aktualizujeme až po obnove obsahu, aby sa do šablóny úloh neuložil názov inej trasy. */
            const heading = document.getElementById('page-title');
            if (heading) heading.textContent = title;
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
            if (sequence !== state.routeSequence) return;
        }
    };

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
                ui.showToast(`Plán bol prepnutý na ${nextPlan === 'premium' ? 'Premium' : 'Standard'} (demo).`);
            } catch (error) {
                ui.showToast(error.message || 'Plán sa nepodarilo zmeniť.', 'error');
            } finally {
                button.disabled = false;
            }
        }
    };

    /* Hlavný zoznam si drží vlastné číslo požiadavky, aby staré API odpovede neprepísali novší pohľad. */
    const taskList = {
        requestSequence: 0,
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
            document.getElementById('open-task-count').textContent = String(open.length);
            document.getElementById('overdue-task-count').textContent = String(open.filter((task) => task.due_date && task.due_date < components.today()).length);
            document.getElementById('completed-task-count').textContent = String(done.length);
            document.getElementById('open-section-count').textContent = `${open.length} ${open.length === 1 ? 'úloha' : 'úloh'}`;
            document.getElementById('done-section-count').textContent = `${done.length} ${done.length === 1 ? 'úloha' : 'úloh'}`;
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
            const description = document.createElement('p');
            description.className = 'task-detail-description';
            description.textContent = this.plainText(task.description) || 'Bez popisu.';
            const facts = document.createElement('dl');
            [[ 'Priorita', this.priorities[Math.min(4, Math.max(1, Number(task.priority) || 2))] ],
                [ 'Projekt', project ? project.name : 'Bez projektu' ], [ 'Termín', this.dateLabel(task.due_date) ],
                [ 'Stav', task.is_done ? 'Hotová' : 'Otvorená' ]].forEach(([label, value]) => {
                const term = document.createElement('dt'); term.textContent = label;
                const detail = document.createElement('dd'); detail.textContent = value;
                facts.append(term, detail);
            });
            content.append(title, description, facts);
            const actions = document.createElement('div');
            actions.className = 'panel-actions';
            const edit = document.createElement('button');
            edit.type = 'button'; edit.className = 'button button-primary';
            edit.dataset.action = 'task-edit'; edit.dataset.taskId = String(task.id);
            edit.textContent = 'Upraviť úlohu';
            actions.append(edit);
            content.append(actions);
            document.getElementById('task-detail-title').textContent = 'Detail úlohy';
            ui.openPanel('task-detail-panel');
        }
    };

    /* Jeden formulár obsluhuje obe operácie; popis sa pred API odoslaním zúži na povolené značky. */
    const taskForm = {
        editingId: null,
        allowedTags: new Set(['B', 'STRONG', 'I', 'EM', 'UL', 'OL', 'LI', 'BR', 'P']),
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
        },
        showErrors(fields) {
            const form = document.getElementById('task-form');
            Object.entries(fields || {}).forEach(([name, message]) => {
                const id = { title: 'task-name', priority: 'task-priority-label', project_id: 'task-project', due_date: 'task-due-date', description: 'task-description' }[name];
                const input = name === 'priority' ? form.querySelector('[name="priority"]') : id && document.getElementById(id);
                const error = document.getElementById(`task-${name.replace('_', '-')}-error`);
                if (input) input.setAttribute('aria-invalid', 'true');
                if (error) error.textContent = message;
            });
            const firstInvalid = form.querySelector('[aria-invalid="true"]');
            if (firstInvalid) firstInvalid.focus();
        },
        open(task) {
            const form = document.getElementById('task-form');
            this.editingId = task ? task.id : null;
            this.clearErrors();
            form.reset();
            form.elements.title.value = task ? task.title || '' : '';
            form.elements.priority.value = String(task ? task.priority || 2 : 2);
            form.elements.due_date.value = task ? task.due_date || '' : components.today();
            form.elements.description.value = task ? task.description || '' : '';
            document.getElementById('task-description').innerHTML = this.sanitize(task && task.description || '');
            const select = form.elements.project_id;
            select.replaceChildren(...state.projects.map((project) => {
                const option = document.createElement('option');
                option.value = String(project.id); option.textContent = project.name;
                return option;
            }));
            const preferred = task ? task.project_id : state.projects[0]?.id;
            if (preferred != null) select.value = String(preferred);
            document.getElementById('task-panel-title').textContent = task ? 'Upraviť úlohu' : 'Nová úloha';
            document.querySelector('.task-delete-button').hidden = !task;
            ui.openPanel('task-panel');
        },
        async save(button) {
            const form = document.getElementById('task-form');
            this.clearErrors();
            const title = form.elements.title.value.trim();
            const description = this.sanitize(document.getElementById('task-description').innerHTML);
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
                await api.request(this.editingId ? 'PATCH' : 'POST', this.editingId ? `/api/tasks/${this.editingId}` : '/api/tasks', data);
                ui.closePanels();
                if (router.current().name === 'tasks') await views.loadTasks(state.routeSequence);
                ui.showToast(this.editingId ? 'Úloha bola upravená.' : 'Úloha bola vytvorená.');
            } catch (error) {
                if (error.status === 422) this.showErrors(error.fields);
                else ui.showToast(error.message || 'Úlohu sa nepodarilo uložiť.', 'error');
            } finally { button.disabled = false; }
        },
        async remove(button) {
            if (!this.editingId) return;
            if (!window.confirm('Naozaj chceš odstrániť túto úlohu?')) return;
            if (!window.confirm('Odstránenie je trvalé. Potvrď ešte raz.')) return;
            button.disabled = true;
            try {
                await api.request('DELETE', `/api/tasks/${this.editingId}`);
                ui.closePanels();
                if (router.current().name === 'tasks') await views.loadTasks(state.routeSequence);
                ui.showToast('Úloha bola odstránená.');
            } catch (error) { ui.showToast(error.message || 'Úlohu sa nepodarilo odstrániť.', 'error'); }
            finally { button.disabled = false; }
        }
    };

    const views = {
        async loadTasks(routeSequence) {
            const requestSequence = ++taskList.requestSequence;
            taskList.loading();
            try {
                const [tasks, projects] = await Promise.all([
                    api.request('GET', '/api/tasks'),
                    api.request('GET', '/api/projects')
                ]);
                if (requestSequence !== taskList.requestSequence || routeSequence !== state.routeSequence) return;
                state.projects = Array.isArray(projects) ? projects : [];
                state.tasks = Array.isArray(tasks) ? tasks : [];
                taskList.render(state.tasks, new Map(state.projects.map((project) => [Number(project.id), project])));
            } catch (error) {
                if (requestSequence === taskList.requestSequence && routeSequence === state.routeSequence) taskList.error(error);
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
        if (action === 'menu-toggle') ui.openPanel('navigation-drawer');
        if (action === 'menu-close' || action === 'panel-close' || action === 'overlay-close') ui.closePanels();
        if (action === 'task-create') taskForm.open(null);
        if (action === 'task-detail') {
            const task = state.tasks.find((item) => String(item.id) === this.closest('.task-card')?.dataset.taskId);
            if (task) taskList.showDetail(task);
        }
        if (action === 'task-edit') {
            const task = state.tasks.find((item) => String(item.id) === this.dataset.taskId);
            if (task) { ui.closePanels(); taskForm.open(task); }
        }
        if (action === 'task-save') taskForm.save(this);
        if (action === 'task-delete') taskForm.remove(this);
        if (action === 'tasks-retry') views.loadTasks(state.routeSequence);
        if (action === 'project-open') ui.openPanel('project-panel');
        if (action === 'profile-open') { profile.render(); ui.openPanel('profile-panel'); }
        if (action === 'profile-save') profile.save(this);
        if (action === 'plan-toggle') profile.togglePlan(this);
        if (action === 'show-register') window.location.hash = 'register';
        if (action === 'show-login') window.location.hash = 'login';
        if (action === 'logout') auth.logout(this);
        if (action === 'navigate' && this.getAttribute('href')) ui.closePanels();
        if (action === 'filter') ui.showToast('Filtrovanie úloh bude dostupné v ďalšom kroku.');
        if (action === 'notifications') ui.showToast('Nemáš nové upozornenia.');
        if (action === 'task-complete' || action === 'project-save' || action === 'login-submit' ||
            action === 'register-submit') {
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

    /* Editor povoľuje formátovanie cez toolbar, no obsah vložený zvonka zmení na obyčajný text. */
    $(document).on('click', '[data-editor-command]', function () {
        const editor = document.getElementById('task-description');
        editor.focus();
        document.execCommand(this.dataset.editorCommand, false);
    });
    $(document).on('paste', '#task-description', function (event) {
        event.preventDefault();
        const text = (event.originalEvent.clipboardData || window.clipboardData).getData('text/plain');
        document.execCommand('insertText', false, text);
    });

    $(document).on('change', '#theme-preference', function () {
        theme.set(this.value);
    });

    $(document).on('keydown', (event) => {
        if (event.key === 'Escape') ui.closePanels();
    });

    window.Tasko = { i18n, api, state, router, ui, views, components, profile, theme, taskList };
    theme.init();
    i18n.apply();
    views.init();
}(window.jQuery, window, document));
