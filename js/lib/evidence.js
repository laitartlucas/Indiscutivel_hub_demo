/* global FileReader */
// Evidências dos check-ins no navegador: reduz fotos (máximo 1600 px no maior lado, JPEG ~0,85) e lê PDFs como estão.
// Mesmo caminho da foto de perfil (lib/avatar.js): sem blob: URL (a CSP só aceita img-src 'self' data:), só data URL.
// As regras puras (tamanhos, tipos, contas) ficam em lib/journey.js, com testes.

import { decodeImage } from './avatar.js';
import { DEMO_IMAGE_MAX_BYTES, IMAGE_MAX_BYTES, IMAGE_QUALITY, IMAGE_SIDES, PDF_TYPE, dataUrlBytes, fileName, fitWithin } from './journey.js';

const UNREADABLE = 'Não foi possível ler esse arquivo. Tente outro.';

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('read'));
    reader.readAsDataURL(file);
  });
}

/**
 * Reduz a imagem (máximo 1600 px no maior lado, JPEG ~0,85) e devolve { dataUrl, name, bytes } ou { error }. Se passar de
 * `maxBytes`, tenta qualidades e lados menores antes de desistir.
 */
async function reduceImage(file, maxBytes) {
  let image;
  try {
    image = await decodeImage(file);
  } catch {
    return { error: 'Não foi possível ler essa imagem. Tente outro arquivo.' };
  }
  const width = image.width ?? image.naturalWidth;
  const height = image.height ?? image.naturalHeight;
  if (!fitWithin(width, height).width) return { error: UNREADABLE };
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return { error: 'Seu navegador não conseguiu preparar a imagem.' };
  try {
    for (const side of IMAGE_SIDES) {
      const size = fitWithin(width, height, side);
      canvas.width = size.width;
      canvas.height = size.height;
      ctx.fillStyle = '#ffffff'; // PNG transparente vira fundo branco no JPEG
      ctx.fillRect(0, 0, size.width, size.height);
      ctx.drawImage(image, 0, 0, size.width, size.height);
      for (const quality of [IMAGE_QUALITY, 0.75, 0.65]) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const bytes = dataUrlBytes(dataUrl);
        if (bytes <= maxBytes) return { dataUrl, name: fileName(file.name, { reducedToJpeg: true }), bytes };
      }
    }
  } finally {
    image.close?.();
  }
  return { error: 'A imagem continua grande depois de reduzida. Escolha outra.' };
}

/**
 * Prepara o arquivo para POST .../files: imagem reduzida ou PDF como está. Devolve { dataUrl, name, bytes } ou { error }.
 * `demo`: na demonstração cada imagem precisa caber em 400 KB (fica guardada só no navegador).
 */
export async function prepareEvidence(file, { demo = false } = {}) {
  if (file.type === PDF_TYPE) {
    try {
      const dataUrl = await readAsDataUrl(file);
      return { dataUrl, name: fileName(file.name), bytes: file.size };
    } catch {
      return { error: UNREADABLE };
    }
  }
  return reduceImage(file, demo ? DEMO_IMAGE_MAX_BYTES : IMAGE_MAX_BYTES);
}
