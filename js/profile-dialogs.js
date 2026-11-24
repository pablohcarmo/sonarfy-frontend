import { icon } from './profile-icons.js';
import { avatar, cover, stars } from './profile-views.js';
import { waveform } from './profile-shell.js';
import { escapeHTML as e, profileURL, count, timestamp, length, limits, validateProfile, validateReview, safeImage } from './profile-utils.js';
import { computeAvatarCrop, computePreviewTransform, validateAvatarFile } from './avatar-crop.js';

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
            open('Compartilhar Perfil', `<div class="share-preview">${avatar(profile, 'share-avatar')}<div><strong>${e(profile.displayName)}</strong><p>@${e(profile.handle)}${profile.ratedCount == null ? '' : ` · ${count(profile.ratedCount)} Álbuns Avaliados`}</p></div></div><div class="share-link"><label for="profile-url">Link direto do perfil</label><div class="share-link-row"><div class="share-url">${icon('link')}<input id="profile-url" readonly value="${e(url)}"></div><button id="copy-profile" class="profile-primary">${icon('copy')}<span>Copiar</span></button></div></div><div class="share-networks"><p>Compartilhar em</p><div><a href="https://wa.me/?text=${encodedText}%20${encodedURL}" target="_blank" rel="noopener noreferrer">${icon('whatsapp')}<span>WhatsApp</span></a><a href="https://twitter.com/intent/tweet?url=${encodedURL}&text=${encodedText}" target="_blank" rel="noopener noreferrer">${icon('x')}<span>X (Twitter)</span></a><a href="https://t.me/share/url?url=${encodedURL}&text=${encodedText}" target="_blank" rel="noopener noreferrer">${icon('telegram')}<span>Telegram</span></a><button id="share-more">${icon('more')}<span>Mais opções</span></button></div></div>`, 'share-dialog');
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
            if (profile.id !== session?.userId || profile.editable === false) { notify('Sem permissão para editar este perfil.'); return; }
            const nameLimit = adapter.demo ? limits.displayName : limits.httpDisplayName;
            const draft = { displayName: profile.displayName, bio: profile.bio || '', cover: profile.cover || '', avatar: profile.avatar || '' };
            const urls = [];
            const files = {};
            let avatarCrop = null;
            let avatarDims = null;
            const supportsAvatarCrop = typeof adapter.uploadAvatar === 'function';
            const supportsWallpaperUpload = typeof adapter.uploadWallpaper === 'function';
            open('Editar Perfil', `<form id="edit-profile-form"><div class="edit-media"><div class="edit-cover">${safeImage(draft.cover) ? `<img src="${safeImage(draft.cover)}" alt="Capa atual">` : waveform()}<label class="media-upload" aria-label="Alterar capa">${icon('camera')}<input name="cover" type="file" aria-label="Alterar capa"></label></div><div class="edit-avatar">${avatar(profile)}<label class="media-upload" aria-label="Alterar avatar">${icon('camera')}<input name="avatar" type="file" aria-label="Alterar avatar"></label></div></div><section id="avatar-crop-panel" class="avatar-crop-panel" aria-label="Ajustar recorte do avatar" hidden><div class="avatar-crop-stage-wrap"><div id="avatar-crop-stage" class="avatar-crop-stage" role="img" aria-label="Prévia circular do avatar"><img id="avatar-crop-img" alt=""></div></div><div class="avatar-crop-controls"><label>Zoom <input id="avatar-zoom" type="range" min="1" max="4" step="0.05" value="1"></label><label>Posição horizontal <input id="avatar-pan-x" type="range" min="-1" max="1" step="0.02" value="0"></label><label>Posição vertical <input id="avatar-pan-y" type="range" min="-1" max="1" step="0.02" value="0"></label><div class="avatar-crop-buttons"><button type="button" id="avatar-crop-reset" class="profile-secondary">Centralizar</button><button type="button" id="avatar-crop-cancel" class="profile-secondary">Descartar foto</button></div></div></section><div class="edit-field"><div><label for="display-name">Nome de exibição</label><output id="name-count" for="display-name">${length(draft.displayName)} / ${nameLimit}</output></div><input id="display-name" name="displayName" value="${e(draft.displayName)}" required maxlength="${nameLimit}"></div><div class="edit-field"><div><label for="profile-bio">Bio</label><output id="bio-count" for="profile-bio">${length(draft.bio)} / 150</output></div><textarea id="profile-bio" name="bio" maxlength="150">${e(draft.bio)}</textarea></div><div class="edit-actions"><button type="button" class="profile-secondary" data-close>Cancelar</button><button class="profile-primary" id="save-profile">Salvar Alterações</button></div></form>`, 'edit-dialog');
            const form = dialog.querySelector('form');
            const cropPanel = dialog.querySelector('#avatar-crop-panel');
            const cropStage = dialog.querySelector('#avatar-crop-stage');
            const cropImg = dialog.querySelector('#avatar-crop-img');
            const zoomInput = dialog.querySelector('#avatar-zoom');
            const panXInput = dialog.querySelector('#avatar-pan-x');
            const panYInput = dialog.querySelector('#avatar-pan-y');
            let alive = true;
            cleanup = () => { alive = false; urls.forEach(url => URL.revokeObjectURL(url)); };
            // Update the circular crop preview and integer coordinates from current slider values.
            const updateAvatarCrop = () => {
                if (!avatarDims) return;
                avatarCrop = computeAvatarCrop({
                    imageWidth: avatarDims.width,
                    imageHeight: avatarDims.height,
                    zoom: Number(zoomInput.value),
                    panX: Number(panXInput.value),
                    panY: Number(panYInput.value)
                });
                const stageSize = cropStage.clientWidth || 180;
                const pos = computePreviewTransform({
                    imageWidth: avatarDims.width,
                    imageHeight: avatarDims.height,
                    ...avatarCrop,
                    viewportSize: stageSize
                });
                cropImg.style.width = `${pos.width}px`;
                cropImg.style.height = `${pos.height}px`;
                cropImg.style.left = `${pos.left}px`;
                cropImg.style.top = `${pos.top}px`;
            };
            const resetAvatarSelection = () => {
                delete files.avatar;
                avatarCrop = null;
                avatarDims = null;
                form.elements.avatar.value = '';
                cropPanel.hidden = true;
                cropImg.removeAttribute('src');
                const slot = dialog.querySelector('.edit-avatar');
                slot.innerHTML = `${avatar(profile)}<label class="media-upload" aria-label="Alterar avatar">${icon('camera')}<input name="avatar" type="file" aria-label="Alterar avatar"></label>`;
                bindMediaInput(slot.querySelector('input'), 'avatar');
            };
            for (const slider of [zoomInput, panXInput, panYInput]) {
                slider.addEventListener('input', updateAvatarCrop);
            }
            dialog.querySelector('#avatar-crop-reset').addEventListener('click', () => {
                zoomInput.value = '1';
                panXInput.value = '0';
                panYInput.value = '0';
                updateAvatarCrop();
            });
            dialog.querySelector('#avatar-crop-cancel').addEventListener('click', () => {
                resetAvatarSelection();
                status('');
            });
            // Dragging inside the circular stage pans the image intuitively on pointer devices.
            let dragOrigin = null;
            cropStage.addEventListener('pointerdown', event => {
                if (!avatarDims) return;
                dragOrigin = { x: event.clientX, y: event.clientY, panX: Number(panXInput.value), panY: Number(panYInput.value) };
                cropStage.setPointerCapture?.(event.pointerId);
            });
            cropStage.addEventListener('pointermove', event => {
                if (!dragOrigin || !avatarDims) return;
                const stageSize = cropStage.clientWidth || 180;
                const dx = (event.clientX - dragOrigin.x) / (stageSize * 0.5);
                const dy = (event.clientY - dragOrigin.y) / (stageSize * 0.5);
                panXInput.value = String(Math.min(1, Math.max(-1, dragOrigin.panX - dx)));
                panYInput.value = String(Math.min(1, Math.max(-1, dragOrigin.panY - dy)));
                updateAvatarCrop();
            });
            cropStage.addEventListener('pointerup', () => { dragOrigin = null; });
            cropStage.addEventListener('pointercancel', () => { dragOrigin = null; });

            for (const [name, limit, output] of [['displayName', nameLimit, '#name-count'], ['bio', limits.bio, '#bio-count']]) {
                form.elements[name].addEventListener('input', event => {
                    // Count code points consistently with the contract, including pasted Unicode text.
                    const value = Array.from(event.target.value).slice(0, limit).join('');
                    event.target.value = value; draft[name] = value;
                    dialog.querySelector(output).textContent = `${length(value)} / ${limit}`;
                });
            }
            const bindMediaInput = (input, field) => {
                const policy = adapter.uploadPolicy;
                const canUploadField = field === 'avatar'
                    ? Boolean((supportsAvatarCrop || adapter.upload) && policy)
                    : Boolean((supportsWallpaperUpload || adapter.upload) && policy);
                input.accept = policy?.types?.join(',') || '';
                input.disabled = !canUploadField;
                input.addEventListener('change', () => {
                    const file = input.files[0];
                    if (!file) return;
                    if (field === 'cover' && supportsWallpaperUpload) {
                        try { validateAvatarFile(file, null, policy); }
                        catch (err) { input.value = ''; status(err.message); return; }
                        const url = URL.createObjectURL(file); urls.push(url);
                        const probe = new Image();
                        probe.onload = () => {
                            if (!alive) return;
                            const dims = { width: probe.naturalWidth, height: probe.naturalHeight };
                            try { validateAvatarFile(file, dims, policy); }
                            catch (err) { input.value = ''; status(err.message); return; }
                            files.cover = file;
                            const slot = dialog.querySelector('.edit-cover');
                            let img = slot.querySelector(':scope > img');
                            if (!img) { img = document.createElement('img'); img.alt = 'Prévia da capa'; slot.prepend(img); }
                            slot.querySelector('.waveform')?.remove();
                            img.src = url;
                            status('');
                        };
                        probe.onerror = () => {
                            if (!alive) return;
                            input.value = '';
                            status('Não foi possível ler a imagem selecionada. Escolha um JPEG ou PNG válido.');
                        };
                        probe.src = url;
                        return;
                    }
                    if (field === 'avatar' && supportsAvatarCrop) {
                        try { validateAvatarFile(file, null, policy); }
                        catch (err) { input.value = ''; status(err.message); return; }
                        const url = URL.createObjectURL(file); urls.push(url);
                        const probe = new Image();
                        probe.onload = () => {
                            if (!alive) return;
                            const dims = { width: probe.naturalWidth, height: probe.naturalHeight };
                            try { validateAvatarFile(file, dims, policy); }
                            catch (err) { input.value = ''; status(err.message); return; }
                            files.avatar = file;
                            avatarDims = dims;
                            zoomInput.value = '1';
                            panXInput.value = '0';
                            panYInput.value = '0';
                            cropImg.src = url;
                            cropPanel.hidden = false;
                            updateAvatarCrop();
                            const slot = dialog.querySelector('.edit-avatar .profile-avatar');
                            let img = slot.querySelector(':scope > img');
                            if (!img) { img = document.createElement('img'); img.alt = ''; slot.prepend(img); }
                            img.src = url;
                            status('');
                        };
                        probe.onerror = () => {
                            if (!alive) return;
                            input.value = '';
                            status('Não foi possível ler a imagem selecionada. Escolha um JPEG ou PNG válido.');
                        };
                        probe.src = url;
                        return;
                    }
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
            };
            for (const field of ['cover', 'avatar']) {
                bindMediaInput(form.elements[field], field);
            }
            form.addEventListener('submit', async event => {
                event.preventDefault();
                if (saving) return;
                try { validateProfile(draft, nameLimit); } catch (error) { status(error.message); return; }
                saving = true;
                const controls = [...dialog.querySelectorAll('button, input, textarea')];
                const previouslyDisabled = controls.filter(control => control.disabled);
                controls.forEach(control => { control.disabled = true; });
                status('Salvando alterações…');
                try {
                    let latest = null;
                    if (files.avatar && supportsAvatarCrop) {
                        latest = await adapter.uploadAvatar(files.avatar, avatarCrop);
                        if (!alive) return;
                        draft.avatar = latest.avatar || '';
                        delete files.avatar;
                        cropPanel.hidden = true;
                    }
                    if (files.cover && supportsWallpaperUpload) {
                        latest = await adapter.uploadWallpaper(files.cover);
                        if (!alive) return;
                        draft.cover = latest.cover || '';
                        delete files.cover;
                    }
                    for (const [field, file] of Object.entries(files)) draft[field] = await adapter.upload(file, field);
                    const textChanged = draft.displayName.trim() !== profile.displayName || draft.bio !== (profile.bio || '');
                    const usesDedicatedMedia = supportsAvatarCrop || supportsWallpaperUpload;
                    const updated = (!usesDedicatedMedia || textChanged || !latest)
                        ? await adapter.updateProfile({ ...draft, displayName: draft.displayName.trim() })
                        : latest;
                    if (!alive) return;
                    Object.assign(profile, updated);
                    for (const items of [store.state.data.activities, store.state.data.replies, store.state.data.collection, store.state.reviews?.items || []]) {
                        items.filter(item => item.author.id === profile.id).forEach(item => { item.author = profile; });
                    }
                    onSaved(); saving = false; dialog.close(); notify(adapter.demo ? 'Perfil atualizado nesta demonstração.' : 'Perfil atualizado com sucesso.');
                } catch (error) { if (alive) status(error.message || 'Não foi possível salvar. Tente novamente.'); }
                finally { saving = false; controls.forEach(control => { control.disabled = previouslyDisabled.includes(control); }); }
            });
        },
        review(item) {
            const sessionUserId = store.state.data?.session?.userId;
            const isOwnReview = Boolean(!adapter.demo && sessionUserId != null && item.author?.id != null && String(item.author.id) === String(sessionUserId));
            const canEditReview = isOwnReview && typeof adapter.updateReview === 'function';
            const canDeleteReview = isOwnReview && typeof adapter.deleteReview === 'function';
            const ownerActions = (canEditReview || canDeleteReview)
                ? `<div class="expanded-review-actions">${canEditReview ? `<button type="button" class="profile-secondary expanded-review-icon-btn" data-edit-review="${e(item.id)}" aria-label="Editar avaliação" title="Editar avaliação">${icon('edit')}</button>` : ''}${canDeleteReview ? `<button type="button" class="profile-secondary profile-danger expanded-review-icon-btn" data-delete-review="${e(item.id)}" aria-label="Excluir avaliação" title="Excluir avaliação">${icon('trash')}</button>` : ''}</div>`
                : '';
            open('Avaliação do álbum', `<div class="expanded-album">${cover(item.album)}<div><strong>${e(item.album.title)}</strong><p>${e(item.album.artist)}</p></div></div><div class="expanded-rating">${stars(item.rating)}<time datetime="${e(item.createdAt)}">${e(timestamp(item.createdAt))}</time></div>${item.review ? `<p class="expanded-review">${e(item.review)}</p>` : ''}${ownerActions}`, 'review-dialog');
            dialog.querySelector('#dialog-title').classList.add('visually-hidden');
            dialog.querySelector('.dialog-heading').prepend(dialog.querySelector('.expanded-album'));
            const actionsBox = dialog.querySelector('.expanded-review-actions');
            const bindInitialOwnerActions = () => {
                if (!actionsBox) return;
                const editBtn = actionsBox.querySelector('[data-edit-review]');
                if (editBtn) {
                    editBtn.addEventListener('click', () => {
                        if (!saving) this.editReview(item);
                    });
                }
                const deleteBtn = actionsBox.querySelector('[data-delete-review]');
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', () => {
                        if (saving) return;
                        status('');
                        actionsBox.innerHTML = `<button type="button" class="expanded-review-confirm-delete" data-confirm-delete-review="${e(item.id)}">Confirmar exclusão</button><button type="button" class="expanded-review-cancel-delete" data-cancel-delete-review="${e(item.id)}">Cancelar</button>`;
                        const confirmBtn = actionsBox.querySelector('[data-confirm-delete-review]');
                        const cancelBtn = actionsBox.querySelector('[data-cancel-delete-review]');
                        cancelBtn.addEventListener('click', () => {
                            if (saving) return;
                            status('');
                            actionsBox.innerHTML = `${canEditReview ? `<button type="button" class="profile-secondary expanded-review-icon-btn" data-edit-review="${e(item.id)}" aria-label="Editar avaliação" title="Editar avaliação">${icon('edit')}</button>` : ''}${canDeleteReview ? `<button type="button" class="profile-secondary profile-danger expanded-review-icon-btn" data-delete-review="${e(item.id)}" aria-label="Excluir avaliação" title="Excluir avaliação">${icon('trash')}</button>` : ''}`;
                            bindInitialOwnerActions();
                            actionsBox.querySelector('[data-delete-review]')?.focus();
                        });
                        confirmBtn.addEventListener('click', async () => {
                            if (saving) return;
                            saving = true;
                            confirmBtn.disabled = true;
                            cancelBtn.disabled = true;
                            status('Excluindo avaliação…');
                            try {
                                await adapter.deleteReview(item.reviewId ?? item.id);
                                try { localStorage.setItem('sonarfy_reviews_dirty', String(Date.now())); } catch {}
                                saving = false;
                                dialog.close();
                                notify('Avaliação excluída.');
                                await store.invalidateReviewsAndCollection();
                            } catch (error) {
                                saving = false;
                                confirmBtn.disabled = false;
                                cancelBtn.disabled = false;
                                status(error?.message || 'Não foi possível excluir a avaliação. Tente novamente.');
                            }
                        });
                        confirmBtn.focus();
                    });
                }
            };
            bindInitialOwnerActions();
        },
        // Abre o modo de edição inline no próprio modal (Collection / Expanded Review Box (Editando) 663:8412) e salva via PUT.
        editReview(item) {
            const sessionUserId = store.state.data?.session?.userId;
            const isOwnReview = Boolean(!adapter.demo && sessionUserId != null && item.author?.id != null && String(item.author.id) === String(sessionUserId));
            if (!isOwnReview || typeof adapter.updateReview !== 'function') {
                notify('Sem permissão para editar esta avaliação.');
                return;
            }
            const savedTrigger = trigger;
            const draft = {
                rating: Math.max(0, Math.min(5, Math.round((Number(item.rating) || 0) * 4) / 4)),
                review: item.review || ''
            };
            open('Editar avaliação do álbum', `<div class="expanded-album">${cover(item.album)}<div><strong>${e(item.album.title)}</strong><p>${e(item.album.artist)}</p></div></div><form id="edit-review-form" class="expanded-edit-form"><div class="expanded-rating"><div id="edit-review-stars-preview">${stars(draft.rating)}</div><time datetime="${e(item.createdAt)}">${e(timestamp(item.createdAt))}</time><input id="edit-review-rating" name="rating" type="hidden" value="${draft.rating}"></div><textarea id="edit-review-text" name="review" class="expanded-review-textarea" aria-label="Resenha" maxlength="${limits.review}" rows="5">${e(draft.review)}</textarea><div class="expanded-review-actions"><button type="submit" class="expanded-review-save" id="save-review">Salvar</button></div></form>`, 'review-dialog edit-review-dialog');
            dialog.querySelector('#dialog-title').classList.add('visually-hidden');
            dialog.querySelector('.dialog-heading').prepend(dialog.querySelector('.expanded-album'));
            trigger = savedTrigger;

            const form = dialog.querySelector('#edit-review-form');
            const ratingInput = form.elements.rating;
            const starsPreview = dialog.querySelector('#edit-review-stars-preview');
            const reviewInput = form.elements.review;

            ratingInput.addEventListener('input', () => {
                draft.rating = Math.max(0, Math.min(5, Math.round(Number(ratingInput.value) * 4) / 4));
                starsPreview.innerHTML = stars(draft.rating);
            });
            starsPreview.addEventListener('click', event => {
                if (saving) return;
                const starEls = [...starsPreview.querySelectorAll('.profile-star')];
                const clicked = event.target.closest('.profile-star');
                const idx = starEls.indexOf(clicked);
                if (idx === -1) return;
                const rect = clicked.getBoundingClientRect();
                const isHalf = rect.width > 0 && (event.clientX - rect.left) < rect.width / 2;
                draft.rating = idx + (isHalf ? 0.5 : 1);
                ratingInput.value = String(draft.rating);
                starsPreview.innerHTML = stars(draft.rating);
            });
            reviewInput.addEventListener('input', () => {
                const value = Array.from(reviewInput.value).slice(0, limits.review).join('');
                reviewInput.value = value;
                draft.review = value;
            });
            form.addEventListener('submit', async event => {
                event.preventDefault();
                if (saving) return;
                draft.rating = Math.max(0, Math.min(5, Math.round(Number(ratingInput.value) * 4) / 4));
                draft.review = Array.from(reviewInput.value).slice(0, limits.review).join('');
                try { validateReview(draft.review); } catch (err) { status(err.message); return; }
                saving = true;
                const controls = [...form.querySelectorAll('button, input, textarea')];
                controls.forEach(c => { c.disabled = true; });
                status('Salvando avaliação…');
                try {
                    await adapter.updateReview(item.reviewId ?? item.id, {
                        rating: draft.rating,
                        reviewText: draft.review
                    });
                    try { localStorage.setItem('sonarfy_reviews_dirty', String(Date.now())); } catch {}
                    saving = false;
                    dialog.close();
                    notify('Avaliação atualizada com sucesso.');
                    await store.invalidateReviewsAndCollection();
                } catch (error) {
                    saving = false;
                    controls.forEach(c => { c.disabled = false; });
                    status(error?.message || 'Não foi possível atualizar a avaliação. Tente novamente.');
                }
            });
            reviewInput.focus();
        }
    };
}
