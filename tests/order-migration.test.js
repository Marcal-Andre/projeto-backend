const migration = require('../src/migrations/20261120183500-create-orders');

describe('migração de pedidos', () => {
  it('mantém snapshots do pedido e cria relações com usuário e produto opcionais', async () => {
    const createdTables = [];
    const droppedTables = [];
    const queryInterface = {
      createTable: jest.fn(async (name, columns) => {
        createdTables.push({ name, columns });
      }),
      addIndex: jest.fn().mockResolvedValue(undefined),
      dropTable: jest.fn(async (name) => {
        droppedTables.push(name);
      }),
    };

    await migration.up(queryInterface);

    expect(createdTables.map((table) => table.name)).toEqual(['orders', 'order_items']);
    expect(createdTables[0].columns.user_id).toMatchObject({
      allowNull: true,
      onDelete: 'SET NULL',
    });
    expect(createdTables[0].columns.status.defaultValue).toBe('pending');
    expect(createdTables[1].columns.product_id).toMatchObject({
      allowNull: true,
      onDelete: 'SET NULL',
    });
    expect(queryInterface.addIndex).toHaveBeenCalledTimes(2);

    await migration.down(queryInterface);
    expect(droppedTables).toEqual(['order_items', 'orders']);
  });
});
