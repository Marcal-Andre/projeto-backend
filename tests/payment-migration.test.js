const migration = require('../src/migrations/20261120185000-add-payment-fields-to-orders');

describe('migração da integração de pagamentos', () => {
  it('adiciona expiração, dados do Mercado Pago e preenche pedidos anteriores', async () => {
    const queryInterface = {
      sequelize: { query: jest.fn().mockResolvedValue(undefined) },
      addColumn: jest.fn().mockResolvedValue(undefined),
      changeColumn: jest.fn().mockResolvedValue(undefined),
      addIndex: jest.fn().mockResolvedValue(undefined),
      removeIndex: jest.fn().mockResolvedValue(undefined),
      removeColumn: jest.fn().mockResolvedValue(undefined),
    };

    await migration.up(queryInterface);

    expect(queryInterface.sequelize.query).toHaveBeenCalledWith(
      'UPDATE `orders` SET `expires_at` = CURRENT_TIMESTAMP WHERE `expires_at` IS NULL',
    );
    expect(queryInterface.changeColumn).toHaveBeenCalledWith('orders', 'expires_at', {
      type: expect.anything(),
      allowNull: false,
    });
    expect(queryInterface.addColumn).toHaveBeenCalledTimes(5);
    expect(queryInterface.addIndex).toHaveBeenCalledWith(
      'orders',
      ['mercadopago_preference_id'],
      { unique: true, name: 'orders_mercadopago_preference_id_unique' },
    );

    await migration.down(queryInterface);
    expect(queryInterface.removeIndex).toHaveBeenCalledWith(
      'orders',
      'orders_mercadopago_preference_id_unique',
    );
    expect(queryInterface.removeColumn).toHaveBeenCalledTimes(5);
  });
});
