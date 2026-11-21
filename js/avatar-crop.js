export const AVATAR_UPLOAD_POLICY = Object.freeze({
    types: Object.freeze(['image/jpeg', 'image/png']),
    maxBytes: 5 * 1024 * 1024,
    maxPixels: 16_000_000,
    minZoom: 1,
    maxZoom: 4
});

// Return image dimensions after applying EXIF orientation (5-8 swap width and height).
export function getOrientedDimensions(width, height, orientation = 1) {
    const w = Number(width);
    const h = Number(height);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
        throw new Error('Dimensões da imagem inválidas.');
    }
    const swap = orientation >= 5 && orientation <= 8;
    return {
        width: Math.round(swap ? h : w),
        height: Math.round(swap ? w : h)
    };
}

// Validate avatar file type, byte size, and pixel count against backend limits.
export function validateAvatarFile(file, dimensions = null, policy = AVATAR_UPLOAD_POLICY) {
    if (!file) throw new Error('Selecione uma imagem JPEG ou PNG.');
    if (!policy.types.includes(file.type)) {
        throw new Error('Formato de imagem não suportado. Use apenas JPEG ou PNG estático.');
    }
    if (typeof file.size !== 'number' || file.size <= 0) {
        throw new Error('O arquivo selecionado está vazio.');
    }
    if (file.size > policy.maxBytes) {
        throw new Error('A imagem excede o limite máximo de 5 MiB.');
    }
    if (dimensions) {
        const pixels = dimensions.width * dimensions.height;
        if (!Number.isFinite(pixels) || pixels <= 0 || pixels > policy.maxPixels) {
            throw new Error('A imagem excede o limite máximo de 16 milhões de pixels.');
        }
    }
}

// Clamp a value to an integer interval [min, max].
function clampInt(value, min, max) {
    return Math.min(max, Math.max(min, Math.trunc(value)));
}

// Compute valid integer square crop coordinates in oriented original image pixels.
export function computeAvatarCrop({ imageWidth, imageHeight, zoom = 1, panX = 0, panY = 0 }) {
    const width = Math.floor(Number(imageWidth));
    const height = Math.floor(Number(imageHeight));
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
        throw new Error('Dimensões da imagem inválidas.');
    }
    const safeZoom = Math.min(AVATAR_UPLOAD_POLICY.maxZoom, Math.max(AVATAR_UPLOAD_POLICY.minZoom, Number(zoom) || 1));
    const minSide = Math.min(width, height);
    const cropSize = clampInt(Math.floor(minSide / safeZoom), 1, minSide);
    const maxX = width - cropSize;
    const maxY = height - cropSize;
    const clampedPanX = Math.min(1, Math.max(-1, Number(panX) || 0));
    const clampedPanY = Math.min(1, Math.max(-1, Number(panY) || 0));

    const cropX = clampedPanX === 0
        ? Math.floor(maxX / 2)
        : clampInt(Math.round(((clampedPanX + 1) / 2) * maxX), 0, maxX);
    const cropY = clampedPanY === 0
        ? Math.floor(maxY / 2)
        : clampInt(Math.round(((clampedPanY + 1) / 2) * maxY), 0, maxY);

    return { cropX, cropY, cropSize };
}

// Validate explicit crop coordinates (all three present or all omitted).
export function validateAvatarCrop(crop, imageWidth = null, imageHeight = null) {
    if (crop === null || crop === undefined) return null;
    const { cropX, cropY, cropSize } = crop;
    if (![cropX, cropY, cropSize].every(v => Number.isSafeInteger(v))) {
        throw new Error('Coordenadas de recorte inválidas.');
    }
    if (cropX < 0 || cropY < 0 || cropSize <= 0) {
        throw new Error('Coordenadas de recorte inválidas.');
    }
    if (imageWidth !== null && imageHeight !== null) {
        if (cropX + cropSize > imageWidth || cropY + cropSize > imageHeight) {
            throw new Error('A seleção de recorte ultrapassa os limites da imagem.');
        }
    }
    return { cropX, cropY, cropSize };
}

// Compute CSS pixel geometry so the circular preview matches the exact backend crop rectangle.
export function computePreviewTransform({ imageWidth, imageHeight, cropX, cropY, cropSize, viewportSize = 180 }) {
    const scale = viewportSize / cropSize;
    return {
        width: imageWidth * scale,
        height: imageHeight * scale,
        left: -cropX * scale,
        top: -cropY * scale
    };
}
