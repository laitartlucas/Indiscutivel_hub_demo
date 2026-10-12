/* global FileReader, createImageBitmap, Image */
// Foto de perfil: regras puras (testadas em web/test/avatar.test.js) e o redimensionamento no navegador.
// A imagem é reduzida para 256x256 (recorte central) e enviada como data URL JPEG de no máximo 150 KB.
// Nada de blob: URL (a CSP só aceita img-src 'self' data:): a leitura usa createImageBitmap ou FileReader.

export const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const AVATAR_MAX_FILE = 2 * 1024 * 1024;
export const AVATAR_SIZE = 256;
export const AVATAR_MAX_CHARS = 150 * 1024;

/** Mensagem de erro para o arquivo escolhido, ou null se pode seguir. `file` = { type, size }. */
export function validateAvatarFile(file) {
  if (!file || !AVATAR_TYPES.includes(file.type)) return 'Escolha uma imagem PNG, JPEG ou WebP.';
  if (!(file.size > 0)) return 'O arquivo está vazio.';
  if (file.size > AVATAR_MAX_FILE) return 'A imagem é grande demais (máximo 2 MB).';
  return null;
}

/** Recorte quadrado central: { sx, sy, size } em pixels da imagem de origem. */
export function coverCrop(width, height) {
  const size = Math.min(width, height);
  return { sx: Math.floor((width - size) / 2), sy: Math.floor((height - size) / 2), size };
}

/**
 * Procura a maior qualidade (de 0,9 a 0,4) cujo resultado cabe em `max` caracteres. `encode(q)` devolve a data URL.
 * Devolve null se nem a menor qualidade couber.
 */
export function fitQuality(encode, max = AVATAR_MAX_CHARS) {
  for (let step = 0; step <= 5; step += 1) {
    const url = encode(Number((0.9 - step * 0.1).toFixed(2)));
    if (typeof url === 'string' && url.length <= max) return url;
  }
  return null;
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('read'));
    reader.readAsDataURL(file);
  });
}

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // cai no caminho com FileReader
    }
  }
  const src = await readAsDataUrl(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode'));
    img.src = src;
  });
}

const UNREADABLE = 'Não foi possível ler essa imagem. Tente outro arquivo.';

/** Lê o arquivo, recorta ao centro e reduz para 256x256. Devolve { dataUrl } ou { error }. */
export async function resizeAvatar(file) {
  const invalid = validateAvatarFile(file);
  if (invalid) return { error: invalid };
  let image;
  try {
    image = await decode(file);
  } catch {
    return { error: UNREADABLE };
  }
  const width = image.width ?? image.naturalWidth;
  const height = image.height ?? image.naturalHeight;
  if (!(width > 0 && height > 0)) return { error: UNREADABLE };
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { error: 'Seu navegador não conseguiu preparar a imagem.' };
  const { sx, sy, size } = coverCrop(width, height);
  ctx.fillStyle = '#ffffff'; // PNG transparente vira fundo branco no JPEG
  ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  ctx.drawImage(image, sx, sy, size, size, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  image.close?.();
  const dataUrl = fitQuality((q) => canvas.toDataURL('image/jpeg', q));
  return dataUrl ? { dataUrl } : { error: 'A imagem continua grande depois de reduzida. Escolha outra.' };
}
