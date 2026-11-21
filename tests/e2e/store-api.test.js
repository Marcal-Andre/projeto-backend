const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

const mediaDirectory = path.join(os.tmpdir(), `projeto-backend-e2e-${randomBytes(8).toString('hex')}`);
process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.MEDIA_DIR = mediaDirectory;
process.env.APP_KEY = randomBytes(32).toString('hex');
process.env.ADMIN_EMAIL = 'admin@example.com';
process.env.ADMIN_PASSWORD = 'admin-password-123';

const app = require('../../src/app');
const authService = require('../../src/services/authService');
const { sequelize, Order, Product, User } = require('../../src/models');
const { expirePendingOrders } = require('../../src/services/orderExpiration');

jest.setTimeout(30000);

describe('API da loja ponta a ponta', () => {
  let server;
  let baseUrl;
  let customer;
  let customerToken;
  let adminToken;
  let category;
  let productId;
  let imageUrl;
  let optionId;

  async function request(url, { method = 'GET', body, token } = {}) {
    const headers = {};
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${baseUrl}${url}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const contentType = response.headers.get('content-type') || '';
    const responseBody = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    return { status: response.status, body: responseBody, headers: response.headers };
  }

  beforeAll(async () => {
    await sequelize.sync({ force: true });
    await authService.bootstrapAdmin();

    server = http.createServer(app);
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  }, 30000);

  afterAll(async () => {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
    await sequelize.close();
    await fs.rm(mediaDirectory, { recursive: true, force: true });
  }, 30000);

  it('cadastra cliente sem expor senha e autentica credenciais válidas', async () => {
    const registration = await request('/v1/user', {
      method: 'POST',
      body: {
        firstname: 'Maria',
        surname: 'Silva',
        email: 'MARIA@example.com',
        password: 'customer-password-123',
        confirmPassword: 'customer-password-123',
        role: 'admin',
        address: {
          postal_code: '12345-678',
          street: 'Rua das Flores',
          number: '10',
          complement: 'Apto 2',
          neighborhood: 'Centro',
          city: 'São Paulo',
          state: 'sp',
        },
      },
    });

    expect(registration.status).toBe(201);
    expect(registration.body).toEqual({
      id: expect.any(Number),
      firstname: 'Maria',
      surname: 'Silva',
      email: 'maria@example.com',
    });
    expect(await User.unscoped().findByPk(registration.body.id)).toMatchObject({
      role: 'customer',
    });

    customer = registration.body;
    const login = await request('/v1/user/token', {
      method: 'POST',
      body: { email: customer.email, password: 'customer-password-123' },
    });
    expect(login.status).toBe(200);
    customerToken = login.body.token;

    const privateProfile = await request(`/v1/user/${customer.id}`);
    expect(privateProfile.status).toBe(401);

    const profile = await request(`/v1/user/${customer.id}`, { token: customerToken });
    expect(profile.status).toBe(200);
    expect(profile.body.email).toBe(customer.email);

    const otherProfile = await request('/v1/user/1', { token: customerToken });
    expect(otherProfile.status).toBe(403);

    const address = await request(`/v1/user/${customer.id}/address`, { token: customerToken });
    expect(address.status).toBe(200);
    expect(address.body).toEqual({
      postal_code: '12345678',
      street: 'Rua das Flores',
      number: '10',
      complement: 'Apto 2',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
    });

    const unauthenticatedAddress = await request(`/v1/user/${customer.id}/address`);
    expect(unauthenticatedAddress.status).toBe(401);

    const updatedAddress = await request(`/v1/user/${customer.id}/address`, {
      method: 'PUT',
      token: customerToken,
      body: { ...address.body, city: 'Campinas' },
    });
    expect(updatedAddress.status).toBe(200);
    expect(updatedAddress.body.city).toBe('Campinas');

    const forbiddenAddress = await request('/v1/user/1/address', { token: customerToken });
    expect(forbiddenAddress.status).toBe(403);

    const invalidLogin = await request('/v1/user/token', {
      method: 'POST',
      body: { email: customer.email, password: 'wrong-password-123' },
    });
    expect(invalidLogin.status).toBe(401);
  });

  it('confirma prontidão incluindo conectividade do banco', async () => {
    const response = await request('/health/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ready', database: 'connected' });
  });

  it('limita o cliente à própria conta e retorna dados sem a senha', async () => {
    const user = await request(`/v1/user/${customer.id}`, { token: customerToken });
    expect(user.status).toBe(200);
    expect(user.body).not.toHaveProperty('password');

    const updateOtherUser = await request('/v1/user/1', {
      method: 'PUT',
      token: customerToken,
      body: {
        firstname: 'Não autorizado',
        surname: 'Silva',
        email: 'admin@example.com',
      },
    });
    expect(updateOtherUser.status).toBe(403);

    const updateSelf = await request(`/v1/user/${customer.id}`, {
      method: 'PUT',
      token: customerToken,
      body: {
        firstname: 'Maria Clara',
        surname: 'Silva',
        email: customer.email,
      },
    });
    expect(updateSelf.status).toBe(204);
  });

  it('nega gerenciamento do catálogo a clientes e aceita administradores', async () => {
    const denied = await request('/v1/category', {
      method: 'POST',
      token: customerToken,
      body: { name: 'Calçados', slug: 'calcados', use_in_menu: true },
    });
    expect(denied.status).toBe(403);

    const adminLogin = await request('/v1/user/token', {
      method: 'POST',
      body: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD },
    });
    expect(adminLogin.status).toBe(200);
    adminToken = adminLogin.body.token;

    const adminProfile = await request(`/v1/user/${customer.id}`, { token: adminToken });
    expect(adminProfile.status).toBe(200);

    const creation = await request('/v1/category', {
      method: 'POST',
      token: adminToken,
      body: { name: 'Calçados', slug: 'calcados', use_in_menu: true },
    });
    expect(creation.status).toBe(201);
    category = creation.body;

    const search = await request('/v1/category/search?limit=1&page=1&fields=name,slug&use_in_menu=true');
    expect(search.status).toBe(200);
    expect(search.body).toMatchObject({
      total: 1,
      limit: 1,
      page: 1,
      data: [{ name: 'Calçados', slug: 'calcados' }],
    });
  });

  it('cria, consulta, filtra, atualiza e exclui produto e imagens', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const creation = await request('/v1/product', {
      method: 'POST',
      token: adminToken,
      body: {
        enabled: true,
        name: 'Tênis de corrida',
        slug: 'tenis-corrida',
        stock: 10,
        description: 'Tênis leve para corrida',
        price: 19.99,
        price_with_discount: 15.99,
        category_ids: [category.id],
        images: [{ type: 'image/png', content: png.toString('base64') }],
        options: [{
          title: 'Tamanho',
          shape: 'square',
          radius: '4px',
          type: 'text',
          values: ['PP', 'GG'],
        }],
      },
    });

    expect(creation.status).toBe(201);
    productId = creation.body.id;

    const details = await request(`/v1/product/${productId}`);
    expect(details.status).toBe(200);
    expect(details.body).toMatchObject({
      id: productId,
      name: 'Tênis de corrida',
      price: 19.99,
      price_with_discount: 15.99,
      category_ids: [category.id],
      options: [{ title: 'Tamanho', radius: 4, values: ['PP', 'GG'] }],
    });
    imageUrl = details.body.images[0].content;
    optionId = details.body.options[0].id;

    expect((await request(imageUrl)).status).toBe(200);

    const search = await request(
      `/v1/product/search?match=corrida&category_ids=${category.id}&price-range=10-20&option%5B${optionId}%5D=GG&fields=id,name,price`,
    );
    expect(search.status).toBe(200);
    expect(search.body).toMatchObject({
      total: 1,
      data: [{ id: productId, name: 'Tênis de corrida', price: 19.99 }],
    });

    const disabledProduct = await request('/v1/product', {
      method: 'POST',
      token: adminToken,
      body: {
        enabled: false,
        name: 'Produto desativado',
        slug: 'produto-desativado',
        stock: 5,
        description: 'Não deve aparecer no catálogo',
        price: 30,
        price_with_discount: 25,
      },
    });
    expect(disabledProduct.status).toBe(201);
    expect((await request(`/v1/product/${disabledProduct.body.id}`)).status).toBe(404);
    const enabledProducts = await request('/v1/product/search?fields=id');
    expect(enabledProducts.body.data.map((product) => product.id)).not.toContain(disabledProduct.body.id);

    const update = await request(`/v1/product/${productId}`, {
      method: 'PUT',
      token: adminToken,
      body: {
        stock: 8,
        images: [{ id: details.body.images[0].id, deleted: true }],
        options: [{ id: optionId, values: ['42', '43'] }],
      },
    });
    expect(update.status).toBe(204);
    expect((await request(imageUrl)).status).toBe(404);

    const updatedDetails = await request(`/v1/product/${productId}`);
    expect(updatedDetails.body).toMatchObject({
      stock: 8,
      images: [],
      options: [{ id: optionId, values: ['42', '43'] }],
    });

    const unauthenticatedCart = await request('/v1/cart');
    expect(unauthenticatedCart.status).toBe(401);

    const missingOption = await request('/v1/cart/items', {
      method: 'POST',
      token: customerToken,
      body: { product_id: productId },
    });
    expect(missingOption.status).toBe(400);

    const addToCart = await request('/v1/cart/items', {
      method: 'POST',
      token: customerToken,
      body: { product_id: productId, quantity: 2, options: { [optionId]: '42' } },
    });
    expect(addToCart.status).toBe(201);
    expect(addToCart.body.items).toMatchObject([{
      product_id: productId,
      quantity: 2,
      options: { [optionId]: '42' },
      product: { id: productId, name: 'Tênis de corrida', stock: 8 },
    }]);

    const addSameVariant = await request('/v1/cart/items', {
      method: 'POST',
      token: customerToken,
      body: { product_id: productId, quantity: 1, options: { [optionId]: '42' } },
    });
    expect(addSameVariant.body.items).toMatchObject([{ quantity: 3 }]);

    const overStock = await request(`/v1/cart/items/${addToCart.body.items[0].id}`, {
      method: 'PATCH',
      token: customerToken,
      body: { quantity: 9 },
    });
    expect(overStock.status).toBe(400);

    const updateCartItem = await request(`/v1/cart/items/${addToCart.body.items[0].id}`, {
      method: 'PATCH',
      token: customerToken,
      body: { quantity: 4 },
    });
    expect(updateCartItem.status).toBe(200);
    expect(updateCartItem.body.items).toMatchObject([{ quantity: 4 }]);

    const removeCartItem = await request(`/v1/cart/items/${addToCart.body.items[0].id}`, {
      method: 'DELETE',
      token: customerToken,
    });
    expect(removeCartItem.status).toBe(200);
    expect(removeCartItem.body.items).toEqual([]);

    await request('/v1/cart/items', {
      method: 'POST',
      token: customerToken,
      body: { product_id: productId, quantity: 4, options: { [optionId]: '42' } },
    });
    const checkout = await request('/v1/order', {
      method: 'POST',
      token: customerToken,
    });
    expect(checkout.status).toBe(201);
    expect(checkout.body).toMatchObject({
      status: 'pending',
      total: 63.96,
      delivery_address: { city: 'Campinas', state: 'SP' },
      items: [{
        product_id: productId,
        product_name: 'Tênis de corrida',
        quantity: 4,
        unit_price: 15.99,
        options: { [optionId]: '42' },
      }],
    });
    const orderId = checkout.body.id;
    expect((await request('/v1/cart', { token: customerToken })).body.items).toEqual([]);
    expect((await request(`/v1/order/${orderId}/payment`, { method: 'POST' })).status).toBe(401);
    expect((await request(`/v1/order/${orderId}`, { token: adminToken })).status).toBe(404);
    const orderHistory = await request('/v1/order', { token: customerToken });
    expect(orderHistory.body).toMatchObject({ total: 1, data: [{ id: orderId, status: 'pending' }] });
    expect((await request(`/v1/order/${orderId}`, { token: customerToken })).body.id).toBe(orderId);
    expect((await request('/v1/order', { token: customerToken, method: 'POST' })).status).toBe(400);

    await request('/v1/cart/items', {
      method: 'POST',
      token: customerToken,
      body: { product_id: productId, options: { [optionId]: '42' } },
    });
    const cancellableOrder = await request('/v1/order', {
      method: 'POST',
      token: customerToken,
    });
    expect(cancellableOrder.status).toBe(201);
    const cancelled = await request(`/v1/order/${cancellableOrder.body.id}/cancel`, {
      method: 'POST',
      token: customerToken,
    });
    expect(cancelled.body).toEqual({ id: cancellableOrder.body.id, status: 'cancelled' });
    expect(await Product.findByPk(productId)).toMatchObject({ stock: 4 });
    expect((await request(`/v1/order/${cancellableOrder.body.id}/cancel`, {
      method: 'POST',
      token: customerToken,
    })).status).toBe(409);

    await request('/v1/cart/items', {
      method: 'POST',
      token: customerToken,
      body: { product_id: productId, options: { [optionId]: '42' } },
    });
    const expiringOrder = await request('/v1/order', {
      method: 'POST',
      token: customerToken,
    });
    await Order.update(
      { expires_at: new Date(Date.now() - 1000) },
      { where: { id: expiringOrder.body.id } },
    );
    expect(await expirePendingOrders()).toBe(1);
    expect(await Order.findByPk(expiringOrder.body.id)).toMatchObject({
      status: 'cancelled',
      mercadopago_payment_status: 'expired',
    });
    expect(await Product.findByPk(productId)).toMatchObject({ stock: 4 });

    const deletion = await request(`/v1/product/${productId}`, {
      method: 'DELETE',
      token: adminToken,
    });
    expect(deletion.status).toBe(204);
    expect((await request(`/v1/product/${productId}`)).status).toBe(404);
    const preservedOrder = await request(`/v1/order/${orderId}`, { token: customerToken });
    expect(preservedOrder.body.items).toMatchObject([{
      product_id: null,
      product_name: 'Tênis de corrida',
      quantity: 4,
    }]);
  });

  it('atualiza e exclui categoria com permissões administrativas', async () => {
    const update = await request(`/v1/category/${category.id}`, {
      method: 'PUT',
      token: adminToken,
      body: { name: 'Calçados esportivos', slug: 'calcados-esportivos', use_in_menu: false },
    });
    expect(update.status).toBe(204);

    const details = await request(`/v1/category/${category.id}`);
    expect(details.body).toMatchObject({
      name: 'Calçados esportivos',
      slug: 'calcados-esportivos',
      use_in_menu: false,
    });

    const deletion = await request(`/v1/category/${category.id}`, {
      method: 'DELETE',
      token: adminToken,
    });
    expect(deletion.status).toBe(204);
    expect((await request(`/v1/category/${category.id}`)).status).toBe(404);
  });

  it('exclui a própria conta com token e mantém o administrador independente', async () => {
    const deletion = await request(`/v1/user/${customer.id}`, {
      method: 'DELETE',
      token: customerToken,
    });

    expect(deletion.status).toBe(204);
    expect((await request(`/v1/user/${customer.id}`, { token: customerToken })).status).toBe(401);
  });
});
