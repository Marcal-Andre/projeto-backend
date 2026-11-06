const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { badRequest } = require('../utils/validation');

const MEDIA_ROOT = path.resolve(process.env.MEDIA_DIR || path.join(process.cwd(), 'uploads'));
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MIME_EXTENSIONS = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/jpg', 'jpg'],
  ['image/webp', 'webp'],
]);

function parseImage(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw badRequest('Cada imagem deve ser um objeto.');
  }

  let mimeType = input.type;
  let encodedContent = input.content;
  if (typeof encodedContent !== 'string') {
    throw badRequest('O conteúdo da imagem deve estar em Base64.');
  }

  const dataUrl = encodedContent.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (dataUrl) {
    if (mimeType && mimeType.toLowerCase() !== dataUrl[1].toLowerCase()) {
      throw badRequest('O tipo declarado da imagem não corresponde ao conteúdo.');
    }
    mimeType = dataUrl[1];
    encodedContent = dataUrl[2];
  }

  if (typeof mimeType !== 'string') {
    throw badRequest('O tipo da imagem é obrigatório.');
  }
  const extension = MIME_EXTENSIONS.get(mimeType.toLowerCase());
  if (!extension) {
    throw badRequest('Formato de imagem não suportado. Use PNG, JPEG ou WebP.');
  }
  if (
    encodedContent.length === 0 ||
    encodedContent.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encodedContent)
  ) {
    throw badRequest('O conteúdo da imagem não é Base64 válido.');
  }

  const buffer = Buffer.from(encodedContent, 'base64');
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
    throw badRequest('Cada imagem deve ter no máximo 4 MB.');
  }
  const validSignature = extension === 'png'
    ? buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    : extension === 'jpg'
      ? buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
      : buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  if (!validSignature) {
    throw badRequest('O conteúdo da imagem não corresponde ao formato declarado.');
  }

  return { extension, buffer };
}

function filepathFor(relativePath) {
  const absolutePath = path.resolve(MEDIA_ROOT, relativePath);
  if (!absolutePath.startsWith(`${MEDIA_ROOT}${path.sep}`)) {
    throw new Error('Caminho de imagem inválido no banco de dados.');
  }
  return absolutePath;
}

async function stageImages(images) {
  const staged = [];
  try {
    for (const image of images) {
      const { extension, buffer } = parseImage(image);
      const filename = `${randomUUID()}.${extension}`;
      const relativePath = path.join('product-images', filename);
      const absolutePath = filepathFor(relativePath);
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, buffer, { flag: 'wx', mode: 0o640 });
      staged.push({ path: relativePath, absolutePath });
    }

    return staged;
  } catch (error) {
    await removeFiles(staged.map((image) => image.path));
    throw error;
  }
}

async function removeFiles(relativePaths) {
  const results = await Promise.allSettled(
    relativePaths.map((relativePath) => fs.rm(filepathFor(relativePath), { force: true })),
  );
  const failure = results.find((result) => result.status === 'rejected');
  if (failure) {
    throw failure.reason;
  }
}

module.exports = {
  MEDIA_ROOT,
  MAX_IMAGE_BYTES,
  parseImage,
  stageImages,
  removeFiles,
};
