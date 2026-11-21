const {
  MercadoPagoConfig,
  Payment,
  PaymentRefund,
  Preference,
  WebhookSignatureValidator,
} = require('mercadopago');

const WEBHOOK_PATH = '/v1/payments/mercadopago/webhook';

function configurationError(message) {
  const error = new Error(message);
  error.status = 503;
  return error;
}

function requiredUrl(name) {
  const value = process.env[name];
  if (!value) {
    throw configurationError(`A configuração ${name} é obrigatória para iniciar o pagamento.`);
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw configurationError(`A configuração ${name} deve ser uma URL válida.`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw configurationError(`A configuração ${name} deve usar HTTP ou HTTPS.`);
  }
  if (process.env.MP_ENVIRONMENT === 'production' && url.protocol !== 'https:') {
    throw configurationError(`A configuração ${name} deve usar HTTPS em produção.`);
  }

  return url.toString().replace(/\/$/, '');
}

function assertPaymentConfiguration() {
  if (!process.env.MP_ACCESS_TOKEN) {
    throw configurationError('MP_ACCESS_TOKEN não está configurado.');
  }

  const environment = process.env.MP_ENVIRONMENT || 'sandbox';
  if (!['sandbox', 'production'].includes(environment)) {
    throw configurationError('MP_ENVIRONMENT deve ser sandbox ou production.');
  }

  return {
    environment,
    successUrl: requiredUrl('MP_SUCCESS_URL'),
    pendingUrl: requiredUrl('MP_PENDING_URL'),
    failureUrl: requiredUrl('MP_FAILURE_URL'),
    notificationUrl: `${requiredUrl('MP_PUBLIC_API_URL')}${WEBHOOK_PATH}`,
  };
}

function clients() {
  if (!process.env.MP_ACCESS_TOKEN) {
    throw configurationError('MP_ACCESS_TOKEN não está configurado.');
  }

  const config = new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN,
    options: { timeout: 10000 },
  });

  return {
    payment: new Payment(config),
    paymentRefund: new PaymentRefund(config),
    preference: new Preference(config),
  };
}

async function createCheckoutPreference(order, payerEmail, configuration) {
  const { preference } = clients();
  const result = await preference.create({
    body: {
      items: order.items.map((item) => ({
        id: String(item.id),
        title: item.product_name,
        quantity: item.quantity,
        unit_price: Number(item.unit_price),
        currency_id: 'BRL',
      })),
      payer: { email: payerEmail },
      external_reference: String(order.id),
      metadata: { order_id: order.id },
      back_urls: {
        success: configuration.successUrl,
        pending: configuration.pendingUrl,
        failure: configuration.failureUrl,
      },
      auto_return: 'approved',
      notification_url: configuration.notificationUrl,
    },
    requestOptions: { idempotencyKey: `store-order-${order.id}` },
  });

  const checkoutUrl = configuration.environment === 'production'
    ? result.init_point
    : result.sandbox_init_point;
  if (!result.id || !checkoutUrl) {
    throw new Error('O Mercado Pago não retornou os dados necessários para o checkout.');
  }

  return {
    preferenceId: result.id,
    checkoutUrl,
  };
}

function verifyWebhook({ signature, requestId, dataId }) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    throw configurationError('MP_WEBHOOK_SECRET não está configurado.');
  }

  WebhookSignatureValidator.validate({
    xSignature: signature,
    xRequestId: requestId,
    dataId,
    secret,
    toleranceSeconds: 300,
  });
}

async function getPayment(paymentId) {
  const { payment } = clients();
  return payment.get({ id: paymentId });
}

async function refundPayment(paymentId, idempotencyKey) {
  const { paymentRefund } = clients();
  return paymentRefund.total({
    payment_id: paymentId,
    requestOptions: { idempotencyKey },
  });
}

module.exports = {
  WEBHOOK_PATH,
  assertPaymentConfiguration,
  createCheckoutPreference,
  verifyWebhook,
  getPayment,
  refundPayment,
};
