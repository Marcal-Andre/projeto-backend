const { createHmac } = require('node:crypto');
const mockCreatePreference = jest.fn();

jest.mock('mercadopago', () => {
  const actual = jest.requireActual('mercadopago');
  return {
    ...actual,
    Preference: jest.fn().mockImplementation(() => ({
      create: mockCreatePreference,
    })),
  };
});

const mercadoPago = require('../src/services/mercadoPago');

describe('integração com Mercado Pago', () => {
  const environmentKeys = [
    'MP_ACCESS_TOKEN',
    'MP_WEBHOOK_SECRET',
    'MP_ENVIRONMENT',
    'MP_PUBLIC_API_URL',
    'MP_SUCCESS_URL',
    'MP_PENDING_URL',
    'MP_FAILURE_URL',
  ];
  const originalEnvironment = Object.fromEntries(
    environmentKeys.map((key) => [key, process.env[key]]),
  );

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MP_ACCESS_TOKEN = 'TEST_ACCESS_TOKEN';
    process.env.MP_WEBHOOK_SECRET = 'test-webhook-secret';
    process.env.MP_ENVIRONMENT = 'sandbox';
    process.env.MP_PUBLIC_API_URL = 'https://api.example.test';
    process.env.MP_SUCCESS_URL = 'http://localhost:5173/checkout/sucesso';
    process.env.MP_PENDING_URL = 'http://localhost:5173/checkout/pendente';
    process.env.MP_FAILURE_URL = 'http://localhost:5173/checkout/falha';
  });

  afterAll(() => {
    for (const key of environmentKeys) {
      if (originalEnvironment[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnvironment[key];
      }
    }
  });

  it('creates a sandbox preference from immutable order snapshots', async () => {
    mockCreatePreference.mockResolvedValue({
      id: 'preference-123',
      sandbox_init_point: 'https://sandbox.mercadopago.test/checkout',
      init_point: 'https://mercadopago.test/checkout',
    });

    const result = await mercadoPago.createCheckoutPreference({
      id: 32,
      items: [{
        id: 92,
        product_name: 'Tênis',
        quantity: 2,
        unit_price: '15.99',
      }],
    }, 'cliente@example.com', mercadoPago.assertPaymentConfiguration());

    expect(result).toEqual({
      preferenceId: 'preference-123',
      checkoutUrl: 'https://sandbox.mercadopago.test/checkout',
    });
    expect(mockCreatePreference).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({
        external_reference: '32',
        notification_url: 'https://api.example.test/v1/payments/mercadopago/webhook',
        payer: { email: 'cliente@example.com' },
        back_urls: {
          success: 'http://localhost:5173/checkout/sucesso',
          pending: 'http://localhost:5173/checkout/pendente',
          failure: 'http://localhost:5173/checkout/falha',
        },
        items: [{
          id: '92',
          title: 'Tênis',
          quantity: 2,
          unit_price: 15.99,
          currency_id: 'BRL',
        }],
      }),
      requestOptions: { idempotencyKey: 'store-order-32' },
    }));
  });

  it('requires private credentials and public HTTPS URLs in production', () => {
    process.env.MP_ENVIRONMENT = 'production';
    process.env.MP_SUCCESS_URL = 'https://store.example.test/checkout/sucesso';
    process.env.MP_PENDING_URL = 'https://store.example.test/checkout/pendente';
    process.env.MP_FAILURE_URL = 'https://store.example.test/checkout/falha';
    process.env.MP_PUBLIC_API_URL = 'http://localhost:3000';

    expect(() => mercadoPago.assertPaymentConfiguration()).toThrow(
      'MP_PUBLIC_API_URL deve usar HTTPS em produção',
    );
  });

  it('verifies Mercado Pago webhook signatures and rejects altered requests', () => {
    const dataId = '123456';
    const requestId = 'request-456';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const manifest = `id:${dataId};request-id:${requestId};ts:${timestamp};`;
    const hash = createHmac('sha256', process.env.MP_WEBHOOK_SECRET)
      .update(manifest)
      .digest('hex');
    const signature = `ts=${timestamp},v1=${hash}`;

    expect(() => mercadoPago.verifyWebhook({
      signature,
      requestId,
      dataId,
    })).not.toThrow();
    expect(() => mercadoPago.verifyWebhook({
      signature,
      requestId: 'altered-request',
      dataId,
    })).toThrow('Invalid webhook signature');
  });
});
