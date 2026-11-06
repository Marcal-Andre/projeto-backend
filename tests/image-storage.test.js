const { parseImage } = require('../src/services/imageStorage');

describe('validação de imagens', () => {
  it('aceita PNG com assinatura correspondente ao MIME', () => {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    expect(parseImage({
      type: 'image/png',
      content: signature.toString('base64'),
    })).toMatchObject({ extension: 'png', buffer: signature });
  });

  it('rejeita conteúdo que não corresponda ao tipo declarado', () => {
    expect(() => parseImage({
      type: 'image/png',
      content: Buffer.from('not an image').toString('base64'),
    })).toThrow('não corresponde ao formato declarado');
  });

  it('rejeita Base64 inválido e formatos não permitidos', () => {
    expect(() => parseImage({ type: 'image/svg+xml', content: 'PHN2Zz4=' })).toThrow(
      'Formato de imagem não suportado',
    );
    expect(() => parseImage({ type: 'image/png', content: 'not-base64' })).toThrow(
      'Base64 válido',
    );
  });
});
