const migration = require('../src/migrations/20261121120000-add-order-fulfillment-and-notifications');
const { DataTypes, Sequelize } = require('sequelize');

describe('migração do ciclo de entrega e notificações', () => {
  it('adiciona idempotência e tabelas de histórico e notificações com índices', async () => {
    const addedColumns = [];
    const createdTables = [];
    const indexes = [];
    const queryInterface = {
      addColumn: jest.fn(async (table, name, definition) => {
        addedColumns.push({ table, name, definition });
      }),
      addIndex: jest.fn(async (table, fields, options) => {
        indexes.push({ table, fields, options });
      }),
      createTable: jest.fn(async (name, columns) => {
        createdTables.push({ name, columns });
      }),
    };

    await migration.up(queryInterface);

    expect(addedColumns.map(({ table, name }) => [table, name])).toEqual([
      ['orders', 'fulfillment_status'],
      ['orders', 'idempotency_key'],
    ]);
    expect(addedColumns[0].definition.defaultValue).toBe('unfulfilled');
    expect(createdTables.map(({ name }) => name)).toEqual([
      'order_status_history',
      'notifications',
    ]);
    expect(createdTables[0].columns.actor_user_id.onDelete).toBe('SET NULL');
    expect(createdTables[1].columns.user_id.onDelete).toBe('CASCADE');
    expect(indexes).toHaveLength(4);
    expect(indexes[0].options.unique).toBe(true);
  });

  it('reverte todas as tabelas, índices e colunas criadas', async () => {
    const actions = [];
    const queryInterface = {
      dropTable: jest.fn(async (name) => actions.push(['dropTable', name])),
      removeIndex: jest.fn(async (table, name) => actions.push(['removeIndex', table, name])),
      removeColumn: jest.fn(async (table, name) => actions.push(['removeColumn', table, name])),
    };

    await migration.down(queryInterface);

    expect(actions).toEqual([
      ['dropTable', 'notifications'],
      ['dropTable', 'order_status_history'],
      ['removeIndex', 'orders', 'orders_user_id_idempotency_key_unique'],
      ['removeColumn', 'orders', 'idempotency_key'],
      ['removeColumn', 'orders', 'fulfillment_status'],
    ]);
  });

  it('aplica e reverte a migração em SQLite e impõe idempotência por cliente', async () => {
    const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    const queryInterface = sequelize.getQueryInterface();

    try {
      await queryInterface.createTable('users', {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      });
      await queryInterface.createTable('orders', {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        user_id: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'id' },
        },
      });
      await migration.up(queryInterface);

      expect(await queryInterface.describeTable('orders')).toHaveProperty('fulfillment_status');
      expect(await queryInterface.describeTable('notifications')).toHaveProperty('read_at');
      await queryInterface.bulkInsert('users', [{ id: 1 }]);
      await queryInterface.bulkInsert('orders', [
        { id: 1, user_id: 1, idempotency_key: 'same-request' },
      ]);
      await expect(queryInterface.bulkInsert('orders', [
        { id: 2, user_id: 1, idempotency_key: 'same-request' },
      ])).rejects.toThrow();

      await migration.down(queryInterface);
      expect(await queryInterface.describeTable('orders')).not.toHaveProperty('fulfillment_status');
    } finally {
      await sequelize.close();
    }
  });
});
