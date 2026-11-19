import { icon } from './profile-icons.js';
import { avatar, cover, stars, socialActions } from './profile-views.js';
import { waveform } from './profile-shell.js';
import { escapeHTML as e, profileURL, count, timestamp, length, limits, validateProfile, safeImage } from './profile-utils.js';

export function containFocus(surface) {
    surface.addEventListener('keydown', event => {
        if (event.key !== 'Tab') return;
        const controls = [...surface.querySelectorAll('a[href],button,input,textarea,select,[tabindex="0"]')].filter(el => !el.disabled && el.getClientRects().length);
        const first = controls[0]; const last = controls.at(-1);
        if (!first) { event.preventDefault(); surface.focus(); }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === surface)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
}

export function createDialogs({ adapter, store, notify, onSaved }) {
    const dialog = document.getElementById('profile-dialog');
    let trigger;
    let cleanup = () => {};
    let saving = false;
    containFocus(dialog);
    function close() { if (!saving) dialog.close(); }
    function open(title, content, className = '') {
        trigger = document.activeElement;
        dialog.className = `profile-dialog ${className}`;
        dialog.innerHTML = `<header class="dialog-heading"><h2 id="dialog-title">${title}</h2><button class="profile-icon-button" data-close aria-label="Fechar">${icon('close')}</button></header>${content}<p class="dialog-status" role="status" aria-live="polite"></p>`;
        dialog.showModal();
        document.body.classList.add('profile-modal-open');
    }
    function status(message) { dialog.querySelector('.dialog-status').textContent = message; }
    dialog.addEventListener('click', event => {
        if (event.target === dialog || event.target.closest('[data-close]')) close();
    });
    dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
    dialog.addEventListener('close', () => {
        cleanup(); cleanup = () => {};
        document.body.classList.remove('profile-modal-open');
        if (trigger?.isConnected) trigger.focus();
        else if (trigger?.dataset.action) document.querySelector(`[data-action="${trigger.dataset.action}"]`)?.focus();
    });
    return {
        share() {
            const profile = store.state.data.profile;
            const url = adapter.profileURL ? adapter.profileURL(profile) : profileURL(profile.handle, adapter.publicOrigin);
            const shareText = `Conheça o perfil de ${profile.displayName} no Sonarfy`;
            const encodedURL = encodeURIComponent(url);
            const encodedText = encodeURIComponent(shareText);
            open('Compartilhar Perfil', `<div class="share-preview">${avatar(profile, 'share-avatar')}<div><strong>${e(profile.displayName)}</strong><p>@${e(profile.handle)} · ${count(profile.ratedCount)} Álbuns Avaliados</p></div></div><div class="share-link"><label for="profile-url">Link direto do perfil</label><div class="share-link-row"><div class="share-url">${icon('link')}<input id="profile-url" readonly value="${e(url)}"></div><button id="copy-profile" class="profile-primary">${icon('copy')}<span>Copiar</span></button></div></div><div class="share-networks"><p>Compartilhar em</p><div><a href="https://wa.me/?text=${encodedText}%20${encodedURL}" target="_blank" rel="noopener noreferrer">${icon('whatsapp')}<span>WhatsApp</span></a><a href="https://twitter.com/intent/tweet?url=${encodedURL}&text=${encodedText}" target="_blank" rel="noopener noreferrer">${icon('x')}<span>X (Twitter)</span></a><a href="https://t.me/share/url?url=${encodedURL}&text=${encodedText}" target="_blank" rel="noopener noreferrer">${icon('telegram')}<span>Telegram</span></a><button id="share-more">${icon('more')}<span>Mais opções</span></button></div></div>`, 'share-dialog');
            const copy = dialog.querySelector('#copy-profile');
            copy.addEventListener('click', async () => {
                copy.disabled = true;
                try {
                    await navigator.clipboard.writeText(url);
                    if (!dialog.open) return;
                    copy.innerHTML = `${icon('check')}<span>Copiado!</span>`;
                    copy.classList.add('copied'); status('Link copiado para a área de transferência.');
                } catch { status('Não foi possível copiar. Selecione o link e copie manualmente.'); dialog.querySelector('#profile-url').select(); }
                finally { copy.disabled = false; }
            });
            dialog.querySelector('#share-more').addEventListener('click', async () => {
                if (!navigator.share) { status('Selecione e copie o link ou use uma das redes acima.'); dialog.querySelector('#profile-url').select(); return; }
                try { await navigator.share({ title: profile.displayName, text: shareText, url }); }
                catch (error) { if (error.name !== 'AbortError') status('Não foi possível compartilhar. Use o link direto.'); }
            });
        },
        edit() {
            const { profile, session } = store.state.data;
            if (profile.id !== session?.userId) { notify('Sem permissão para editar este perfil.'); return; }
            const draft = { displayName: profile.displayName, bio: profile.bio || '', cover: profile.cover || '', avatar: profile.avatar || '' };
            const urls = [];
            const files = {};
            open('Editar Perfil', `<form id="edit-profile-form"><div class="edit-media"><div class="edit-cover">${safeImage(draft.cover) ? `<img src="${safeImage(draft.cover)}" alt="Capa atual">` : waveform()}<label class="media-upload" aria-label="Alterar capa">${icon('camera')}<input name="cover" type="file" aria-label="Alterar capa"></label></div><div class="edit-avatar">${avatar(profile)}<label class="media-upload" aria-label="Alterar avatar">${icon('camera')}<input name="avatar" type="file" aria-label="Alterar avatar"></label></div></div><div class="edit-field"><div><label for="display-name">Nome de exibição</label><output id="name-count" for="display-name">${length(draft.displayName)} / 50</output></div><input id="display-name" name="displayName" value="${e(draft.displayName)}" required maxlength="50"></div><div class="edit-field"><div><label for="profile-bio">Bio</label><output id="bio-count" for="profile-bio">${length(draft.bio)} / 150</output></div><textarea id="profile-bio" name="bio" maxlength="150">${e(draft.bio)}</textarea></div><div class="edit-actions"><button type="button" class="profile-secondary" data-close>Cancelar</button><button class="profile-primary" id="save-profile">Salvar Alterações</button></div></form>`, 'edit-dialog');
            const form = dialog.querySelector('form');
            let alive = true;
            cleanup = () => { alive = false; urls.forEach(url => URL.revokeObjectURL(url)); };
            for (const [name, limit, output] of [['displayName', limits.displayName, '#name-count'], ['bio', limits.bio, '#bio-count']]) {
                form.elements[name].addEventListener('input', event => {
                    // Count code points consistently with the contract, including pasted Unicode text.
                    const value = Array.from(event.target.value).slice(0, limit).join('');
                    event.target.value = value; draft[name] = value;
                    dialog.querySelector(output).textContent = `${length(value)} / ${limit}`;
                });
            }
            for (const field of ['cover', 'avatar']) {
                const input = form.elements[field];
                const policy = adapter.uploadPolicy;
                input.accept = policy?.types?.join(',') || '';
                input.disabled = !adapter.upload || !policy;
                input.addEventListener('change', () => {
                    const file = input.files[0];
                    if (!file) return;
                    if (!policy.types.includes(file.type) || file.size > policy.maxBytes) {
                        input.value = ''; status('Formato ou tamanho de imagem não permitido.'); return;
                    }
                    files[field] = file;
                    const url = URL.createObjectURL(file); urls.push(url);
                    const slot = dialog.querySelector(field === 'cover' ? '.edit-cover' : '.edit-avatar .profile-avatar');
                    let img = slot.querySelector(':scope > img');
                    if (!img) { img = document.createElement('img'); img.alt = ''; slot.prepend(img); }
                    slot.querySelector('.waveform')?.remove(); img.src = url; status('');
                });
            }
            form.addEventListener('submit', async event => {
                event.preventDefault();
                if (saving) return;
                try { validateProfile(draft); } catch (error) { status(error.message); return; }
                saving = true;
                const controls = [...dialog.querySelectorAll('button, input, textarea')];
                const previouslyDisabled = controls.filter(control => control.disabled);
                controls.forEach(control => { control.disabled = true; });
                status('Salvando alterações…');
                try {
                    for (const [field, file] of Object.entries(files)) draft[field] = await adapter.upload(file, field);
                    const updated = await adapter.updateProfile({ ...draft, displayName: draft.displayName.trim() });
                    if (!alive) return;
                    Object.assign(profile, updated);
                    for (const items of [store.state.data.activities, store.state.data.replies, store.state.data.collection]) {
                        items.filter(item => item.author.id === profile.id).forEach(item => { item.author = profile; });
                    }
                    onSaved(); saving = false; dialog.close(); notify(adapter.demo ? 'Perfil atualizado nesta demonstração.' : 'Perfil atualizado com sucesso.');
                } catch (error) { if (alive) status(error.message || 'Não foi possível salvar. Tente novamente.'); }
                finally { saving = false; controls.forEach(control => { control.disabled = previouslyDisabled.includes(control); }); }
            });
        },
        review(item) {
            open('Avaliação do álbum', `<div class="expanded-album">${cover(item.album)}<div><strong>${e(item.album.title)}</strong><p>${e(item.album.artist)}</p></div></div><div class="expanded-rating">${stars(item.rating)}<time datetime="${e(item.createdAt)}">${e(timestamp(item.createdAt))}</time></div>${item.review ? `<p class="expanded-review">${e(item.review)}</p>` : ''}<div id="expanded-social" data-review-id="${e(item.id)}">${socialActions(item, store.state.pending)}</div>`, 'review-dialog');
            dialog.querySelector('#dialog-title').classList.add('visually-hidden');
            dialog.querySelector('.dialog-heading').prepend(dialog.querySelector('.expanded-album'));
        }
    };
}
