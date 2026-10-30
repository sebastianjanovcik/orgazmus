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

    const state = { routeSequence: 0, user: null, projects: [], authReady: false };

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
            const heading = document.getElementById('page-title');
            if (heading) heading.textContent = title;
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
            document.querySelectorAll('.auth-card').forEach((card) => {
                card.hidden = card.id === 'login-form' ? route.name !== 'login' : route.name !== 'register';
            });
            document.querySelectorAll('.nav-link').forEach((link) => {
                const active = link.getAttribute('href') === `#${route.name}`;
                link.classList.toggle('is-active', active);
                if (active) link.setAttribute('aria-current', 'page');
                else link.removeAttribute('aria-current');
            });
            if (sequence !== state.routeSequence) return;
        }
    };

    const ui = {
        toastTimer: null,
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
            panel.classList.add('is-open');
            panel.setAttribute('aria-hidden', 'false');
            const scrim = document.querySelector('.scrim');
            if (scrim) scrim.classList.add('is-visible');
            const firstControl = panel.querySelector('button, input, select, textarea');
            if (firstControl) firstControl.focus();
        },
        closePanels() {
            document.querySelectorAll('.panel.is-open').forEach((panel) => {
                panel.classList.remove('is-open');
                panel.setAttribute('aria-hidden', 'true');
            });
            const scrim = document.querySelector('.scrim');
            if (scrim) scrim.classList.remove('is-visible');
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

    const views = {
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
        if (action === 'task-create') ui.openPanel('task-panel');
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
        if (action === 'task-edit' || action === 'task-complete' || action === 'task-save' ||
            action === 'project-save' || action === 'login-submit' ||
            action === 'register-submit') {
            event.preventDefault();
            ui.showToast('Táto akcia bude dokončená v ďalšom kroku.');
        }
    });

    $(document).on('submit', '#login-form, #register-form', function (event) {
        event.preventDefault();
        auth.submit(this);
    });

    $(document).on('change', '#theme-preference', function () {
        theme.set(this.value);
    });

    $(document).on('keydown', (event) => {
        if (event.key === 'Escape') ui.closePanels();
    });

    window.Tasko = { i18n, api, state, router, ui, views, components, profile, theme };
    theme.init();
    i18n.apply();
    views.init();
}(window.jQuery, window, document));
