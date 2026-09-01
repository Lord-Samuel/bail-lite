import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

/**
 * Minimal jimp replacement: decode (PNG/JPEG) -> crop -> bilinear resize -> JPEG encode.
 * Internal pixel format is always raw RGBA (matches both pngjs and jpeg-js output).
 */

function sniffFormat(buffer) {
    if (buffer.length >= 8 &&
        buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
        return 'png';
    }
    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
        return 'jpeg';
    }
    throw new Error('Unsupported image format (only PNG/JPEG input supported)');
}

function decode(buffer) {
    const format = sniffFormat(buffer);
    if (format === 'png') {
        const png = PNG.sync.read(buffer);
        // pngjs always gives RGBA regardless of source color type
        return { data: png.data, width: png.width, height: png.height };
    }
    // jpeg-js
    const raw = jpeg.decode(buffer, { useTArray: true });
    return { data: raw.data, width: raw.width, height: raw.height };
}

/** Crop a raw RGBA buffer to the given rect. */
function crop({ data, width, height }, x, y, w, h) {
    x = Math.max(0, Math.min(x, width));
    y = Math.max(0, Math.min(y, height));
    w = Math.max(1, Math.min(w, width - x));
    h = Math.max(1, Math.min(h, height - y));

    const out = new Uint8Array(w * h * 4);
    for (let row = 0; row < h; row++) {
        const srcOffset = ((y + row) * width + x) * 4;
        const dstOffset = row * w * 4;
        out.set(data.subarray(srcOffset, srcOffset + w * 4), dstOffset);
    }
    return { data: out, width: w, height: h };
}

/** Bilinear resize of a raw RGBA buffer to targetW x targetH. */
function resizeBilinear({ data, width, height }, targetW, targetH) {
    const out = new Uint8Array(targetW * targetH * 4);
    const xRatio = width / targetW;
    const yRatio = height / targetH;

    for (let ty = 0; ty < targetH; ty++) {
        const srcY = ty * yRatio;
        const y0 = Math.floor(srcY);
        const y1 = Math.min(y0 + 1, height - 1);
        const yFrac = srcY - y0;

        for (let tx = 0; tx < targetW; tx++) {
            const srcX = tx * xRatio;
            const x0 = Math.floor(srcX);
            const x1 = Math.min(x0 + 1, width - 1);
            const xFrac = srcX - x0;

            const i00 = (y0 * width + x0) * 4;
            const i10 = (y0 * width + x1) * 4;
            const i01 = (y1 * width + x0) * 4;
            const i11 = (y1 * width + x1) * 4;
            const outIdx = (ty * targetW + tx) * 4;

            for (let c = 0; c < 4; c++) {
                const top = data[i00 + c] * (1 - xFrac) + data[i10 + c] * xFrac;
                const bottom = data[i01 + c] * (1 - xFrac) + data[i11 + c] * xFrac;
                out[outIdx + c] = Math.round(top * (1 - yFrac) + bottom * yFrac);
            }
        }
    }
    return { data: out, width: targetW, height: targetH };
}

function encodeJpeg({ data, width, height }, quality = 50) {
    // jpeg-js expects RGBA input and ignores alpha on encode
    const encoded = jpeg.encode({ data, width, height }, quality);
    return Buffer.from(encoded.data);
}

/**
 * Thumbnail: decode -> resize to given width, preserving aspect ratio -> JPEG.
 * Mirrors jimp's extractImageThumb behavior.
 */
export function extractImageThumbMini(buffer, width = 32) {
    const img = decode(buffer);
    const aspect = img.height / img.width;
    const targetH = Math.max(1, Math.round(width * aspect));
    const resized = resizeBilinear(img, width, targetH);
    const jpegBuffer = encodeJpeg(resized, 50);
    return {
        buffer: jpegBuffer,
        original: { width: img.width, height: img.height }
    };
}

/**
 * Profile picture: decode -> center-crop to square -> resize to w x h -> JPEG.
 * Mirrors jimp's generateProfilePicture behavior.
 */
export function generateProfilePictureMini(buffer, { width: w = 640, height: h = 640 } = {}) {
    const img = decode(buffer);
    const min = Math.min(img.width, img.height);
    const cropX = Math.floor((img.width - min) / 2);
    const cropY = Math.floor((img.height - min) / 2);
    const cropped = crop(img, cropX, cropY, min, min);
    const resized = resizeBilinear(cropped, w, h);
    const jpegBuffer = encodeJpeg(resized, 50);
    return { img: jpegBuffer };
}