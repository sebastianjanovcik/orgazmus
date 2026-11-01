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
                else if (route.name === 'projects') view.innerHTML = `<div class="page-heading"><div><p class="eyebrow">TASKO</p><h1 id="page-title">Projekty</h1><p class="page-subtitle">Všetky tvoje projekty a ich priebeh na jednom mieste.</p></div><button class="button button-primary project-create-button" type="button" data-action="project-open">＋ Nový projekt</button></div><div id="project-limit-notice" class="project-limit-notice" hidden></div><div id="project-list" class="project-grid" aria-live="polite"><div class="project-skeleton"></div><div class="project-skeleton"></div><div class="project-skeleton"></div></div>`;
                else if (route.name === 'project') view.innerHTML = `<div id="project-detail-view" class="project-detail-view"><div class="project-skeleton"></div></div>`;
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
            if (['calendar', 'done', 'stats'].includes(route.name) && state.user) views.loadInsights(sequence, route.name);
            if ((route.name === 'projects' || route.name === 'project') && state.user) views.loadProjects(sequence, route);
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
            document.getElementById('open-task-count').textContent = String(open.length);
            document.getElementById('overdue-task-count').textContent = String(open.filter((task) => task.due_date && task.due_date < components.today()).length);
            document.getElementById('completed-task-count').textContent = String(done.length);
            document.getElementById('open-section-count').textContent = `${open.length} ${open.length === 1 ? 'úloha' : 'úloh'}`;
            document.getElementById('done-section-count').textContent = `${done.length} ${done.length === 1 ? 'úloha' : 'úloh'}`;
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
                    // Po potvrdení serverom sa karta prekreslí v správnej sekcii; pri chybe ostáva na mieste.
                    this.render(state.tasks, new Map(state.projects.map((project) => [Number(project.id), project])));
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
            document.getElementById('task-detail-title').textContent = 'Detail úlohy';
            ui.openPanel('task-detail-panel');
            commentThreads.load(task.id);
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
            const taskId = button.dataset.taskId || this.editingId;
            if (!taskId) return;
            if (!await ui.confirm('Naozaj chceš odstrániť túto úlohu?', 'Odstrániť úlohu?', 'Odstrániť')) return;
            button.disabled = true;
            try {
                await api.request('DELETE', `/api/tasks/${taskId}`);
                ui.closePanels();
                this.editingId = null;
                if (router.current().name === 'tasks') await views.loadTasks(state.routeSequence);
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
        renderDetail(project) {
            const root = document.getElementById('project-detail-view'); if (!root) return;
            const counts = this.counts(project);
            root.replaceChildren();
            const back = document.createElement('a'); back.href = '#projects'; back.dataset.action = 'navigate'; back.className = 'project-back'; back.textContent = '← Všetky projekty'; root.append(back);
            const head = document.createElement('div'); head.className = 'project-detail-heading'; head.style.setProperty('--project-color', project.color || this.colors[0]);
            const icon = document.createElement('span'); icon.className = 'project-card-icon'; icon.textContent = this.icons[project.icon] || '📁'; icon.setAttribute('aria-hidden', 'true');
            const text = document.createElement('div'); const title = document.createElement('h2'); title.textContent = project.name; const desc = document.createElement('p'); desc.textContent = project.description || 'Bez popisu'; text.append(title, desc);
            const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'button button-quiet'; edit.dataset.action = 'project-edit'; edit.dataset.projectId = String(project.id); edit.textContent = 'Upraviť projekt'; head.append(icon, text, edit); root.append(head);
            const summary = document.createElement('p'); summary.className = 'project-detail-summary'; summary.textContent = `${counts.open} otvorených · ${counts.done} hotových z ${counts.total} úloh`; root.append(summary);
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
                    monthNames: ['január', 'február', 'marec', 'apríl', 'máj', 'jún', 'júl', 'august', 'september', 'október', 'november', 'december'],
                    monthNamesShort: ['jan', 'feb', 'mar', 'apr', 'máj', 'jún', 'júl', 'aug', 'sep', 'okt', 'nov', 'dec'],
                    dayNames: ['nedeľa', 'pondelok', 'utorok', 'streda', 'štvrtok', 'piatok', 'sobota'],
                    dayNamesShort: ['ne', 'po', 'ut', 'st', 'št', 'pi', 'so'],
                    allDayText: 'Celý deň', moreLinkText: 'ďalšie', noEventsText: 'Žiadne úlohy'
                };
                this.calendar = new FullCalendar.Calendar(calendarRoot, {
                    initialView: 'dayGridMonth', locale, firstDay: 1, height: 'auto', dayMaxEvents: 3,
                    headerToolbar: { left: 'prev,next today', center: 'title', right: '' },
                    events: [],
                    datesSet: (info) => this.loadCalendarRange(info, routeSequence),
                    dateClick: (info) => this.selectCalendarDay(info.dateStr),
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
                target.innerHTML = `<div class="page-heading"><div><p class="eyebrow">TASKO</p><h1 id="page-title">Štatistiky</h1><p class="page-subtitle">Prehľad dokončených úloh a priebehu projektov.</p></div></div><div id="task-statistics" class="statistics-grid" aria-live="polite"><div class="statistic-skeleton"></div><div class="statistic-skeleton"></div></div><section class="task-section"><h2 class="statistics-project-heading">Priebeh projektov</h2><div id="project-statistics" class="statistics-project-list"></div></section>`;
            }
            try {
                const [tasks, projects] = await Promise.all([api.request('GET', '/api/tasks'), api.request('GET', '/api/projects')]);
                if (routeSequence !== state.routeSequence) return;
                state.tasks = Array.isArray(tasks) ? tasks : [];
                state.projects = Array.isArray(projects) ? projects : [];
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
                const [tasks, projects] = await Promise.all([
                    api.request('GET', `/api/tasks?from=${encodeURIComponent(info.startStr.slice(0, 10))}&to=${encodeURIComponent(end)}`),
                    api.request('GET', '/api/projects')
                ]);
                if (sequence !== this.calendarSequence || routeSequence !== state.routeSequence || router.current().name !== 'calendar') return;
                state.tasks = Array.isArray(tasks) ? tasks : [];
                state.projects = Array.isArray(projects) ? projects : [];
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
                card.append(number, caption); cards.append(card);
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
            try {
                const [tasks, projects] = await Promise.all([
                    api.request('GET', '/api/tasks'),
                    api.request('GET', '/api/projects')
                ]);
                if (requestSequence !== taskList.requestSequence || routeSequence !== state.routeSequence) return;
                state.projects = Array.isArray(projects) ? projects : [];
                state.tasks = Array.isArray(tasks) ? tasks : [];
                projectManager.renderSidebar();
                taskList.render(state.tasks, new Map(state.projects.map((project) => [Number(project.id), project])));
            } catch (error) {
                if (requestSequence === taskList.requestSequence && routeSequence === state.routeSequence) taskList.error(error);
            }
        },
        async loadProjects(routeSequence, route) {
            try {
                const [projects, tasks] = await Promise.all([api.request('GET', '/api/projects'), api.request('GET', '/api/tasks')]);
                if (routeSequence !== state.routeSequence) return;
                state.projects = Array.isArray(projects) ? projects : [];
                state.tasks = Array.isArray(tasks) ? tasks : [];
                projectManager.renderSidebar();
                if (route.name === 'projects') projectManager.renderList();
                else {
                    const cached = state.projects.find((item) => String(item.id) === String(route.id));
                    if (!cached) { document.getElementById('project-detail-view').textContent = 'Projekt sa nenašiel.'; return; }
                    try { await Promise.all([api.request('GET', `/api/projects/${encodeURIComponent(route.id)}`), api.request('GET', `/api/tasks?project_id=${encodeURIComponent(route.id)}`)]); }
                    catch (_) { /* Detail zostane použiteľný z už načítaného zoznamu aj pri obmedzenom mocku. */ }
                    if (routeSequence === state.routeSequence) projectManager.renderDetail(cached);
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
        if (action === 'filter') ui.showToast('Filtrovanie úloh bude dostupné v ďalšom kroku.');
        if (action === 'notifications') ui.showToast('Nemáš nové upozornenia.');
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
        projectManager.save(document.querySelector('[data-action="project-save"]'));
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
        if (event.key === 'Escape' && !document.getElementById('confirm-dialog').open) ui.closePanels();
    });

    window.Tasko = { i18n, api, state, router, ui, views, components, profile, theme, taskList, commentThreads };
    theme.init();
    i18n.apply();
    views.init();
}(window.jQuery, window, document));
