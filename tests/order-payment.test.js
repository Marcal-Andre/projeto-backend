process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

jest.mock('../src/services/mercadoPago', () => ({
  assertPaymentConfiguration: jest.fn(),
  createCheckoutPreference: jest.fn(),
  verifyWebhook: jest.fn(),
  getPayment: jest.fn(),
  refundPayment: jest.fn(),
}));

const mercadoPago = require('../src/services/mercadoPago');
const orderController = require('../src/controllers/orderController');
const {
  sequelize,
  Order,
  OrderItem,
  OrderStatusHistory,
  Notification,
  User,
} = require('../src/models');

describe('pagamento e notificações de pedidos', () => {
  let user;

  function response() {
    return {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      sendStatus: jest.fn().mockReturnThis(),
    };
  }

  async function createOrder(attributes = {}) {
    return Order.create({
      user_id: user.id,
      status: 'pending',
      expires_at: new Date(Date.now() + 30 * 60 * 1000),
      total: '12.34',
      mercadopago_preference_id: 'preference-1',
      ...attributes,
      postal_code: '12345678',
      street: 'Rua A',
      number: '1',
      complement: '',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
    });
  }

  function webhookRequest(paymentId) {
    return {
      query: { 'data.id': paymentId, type: 'payment' },
      body: {},
      get: (name) => ({
        'x-signature': 'signed',
        'x-request-id': 'request-1',
      }[name]),
    };
  }

  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await OrderItem.destroy({ where: {}, truncate: true });
    await Order.destroy({ where: {}, truncate: true });
    await User.destroy({ where: {}, truncate: true });
    user = await User.create({
      firstname: 'Ana',
      surname: 'Silva',
      email: 'ana@example.com',
      password: 'hashed-password',
      role: 'customer',
    });
    mercadoPago.assertPaymentConfiguration.mockReturnValue({});
    mercadoPago.createCheckoutPreference.mockResolvedValue({
      preferenceId: 'preference-1',
      checkoutUrl: 'https://sandbox.example/checkout',
    });
    mercadoPago.verifyWebhook.mockReturnValue(undefined);
  });

  it('creates a checkout preference once and persists its redirect URL', async () => {
    const order = await createOrder({ mercadopago_preference_id: null });
    await OrderItem.create({
      order_id: order.id,
      product_id: null,
      product_name: 'Produto',
      quantity: 1,
      unit_price: '12.34',
      selected_options: '{}',
    });
    const res = response();

    await orderController.createPayment({
      user: { id: user.id },
      params: { id: String(order.id) },
    }, res);

    expect(mercadoPago.createCheckoutPreference).toHaveBeenCalledWith(
      expect.objectContaining({ id: order.id }),
      user.email,
      {},
    );
    expect(res.json).toHaveBeenCalledWith({
      order_id: order.id,
      preference_id: 'preference-1',
      checkout_url: 'https://sandbox.example/checkout',
    });
    await expect(order.reload()).resolves.toMatchObject({
      mercadopago_preference_id: 'preference-1',
      mercadopago_init_point: 'https://sandbox.example/checkout',
    });
  });

  it('marks an order as paid only after a matching approved payment notification', async () => {
    const order = await createOrder();
    mercadoPago.getPayment.mockResolvedValue({
      id: 'payment-1',
      external_reference: String(order.id),
      preference_id: 'preference-1',
      currency_id: 'BRL',
      transaction_amount: 12.34,
      status: 'approved',
      date_approved: new Date().toISOString(),
    });
    const res = response();

    await orderController.webhook(webhookRequest('payment-1'), res);

    expect(mercadoPago.verifyWebhook).toHaveBeenCalled();
    expect(mercadoPago.getPayment).toHaveBeenCalledWith('payment-1');
    expect(res.sendStatus).toHaveBeenCalledWith(200);
    await expect(order.reload()).resolves.toMatchObject({
      status: 'paid',
      mercadopago_payment_id: 'payment-1',
      mercadopago_payment_status: 'approved',
    });

    await orderController.webhook(webhookRequest('payment-1'), response());
    await expect(OrderStatusHistory.count({
      where: { order_id: order.id, scope: 'payment', to_status: 'paid' },
    })).resolves.toBe(1);
    await expect(Notification.count({
      where: { order_id: order.id, type: 'payment.paid' },
    })).resolves.toBe(1);
  });

  it('does not trust an approved payment for a different order amount', async () => {
    const order = await createOrder();
    mercadoPago.getPayment.mockResolvedValue({
      id: 'payment-2',
      external_reference: String(order.id),
      preference_id: 'preference-1',
      currency_id: 'BRL',
      transaction_amount: 99,
      status: 'approved',
    });
    const logError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = response();

    await orderController.webhook(webhookRequest('payment-2'), res);

    expect(res.sendStatus).toHaveBeenCalledWith(200);
    await expect(order.reload()).resolves.toMatchObject({ status: 'pending' });
    expect(mercadoPago.refundPayment).not.toHaveBeenCalled();
    logError.mockRestore();
  });

  it('refunds an approved payment for an order that was already cancelled', async () => {
    const order = await createOrder({ status: 'cancelled' });
    mercadoPago.getPayment.mockResolvedValue({
      id: 'payment-3',
      external_reference: String(order.id),
      preference_id: 'preference-1',
      currency_id: 'BRL',
      transaction_amount: 12.34,
      status: 'approved',
    });
    mercadoPago.refundPayment.mockResolvedValue({ id: 'refund-1' });
    const res = response();

    await orderController.webhook(webhookRequest('payment-3'), res);

    expect(mercadoPago.refundPayment).toHaveBeenCalledWith(
      'payment-3',
      `store-refund-${order.id}-payment-3`,
    );
    expect(res.sendStatus).toHaveBeenCalledWith(200);
    await expect(order.reload()).resolves.toMatchObject({
      status: 'cancelled',
      mercadopago_payment_status: 'refunded',
    });
  });

  it('rejects invalid webhook signatures before requesting a payment', async () => {
    mercadoPago.verifyWebhook.mockImplementation(() => {
      const error = new Error('invalid signature');
      error.name = 'InvalidWebhookSignatureError';
      throw error;
    });
    const res = response();

    await orderController.webhook(webhookRequest('payment-4'), res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mercadoPago.getPayment).not.toHaveBeenCalled();
  });
});
