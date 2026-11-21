const migration = require('../src/migrations/20261119110000-add-customer-addresses-and-carts');

describe('migração de endereços e carrinhos', () => {
  it('cria tabelas com relacionamentos e remove-as na ordem inversa', async () => {
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

    expect(createdTables.map((table) => table.name)).toEqual([
      'user_addresses',
      'carts',
      'cart_items',
    ]);
    expect(createdTables[0].columns.user_id.references).toEqual({ model: 'users', key: 'id' });
    expect(createdTables[1].columns.user_id.unique).toBe(true);
    expect(createdTables[2].columns.product_id.references).toEqual({ model: 'products', key: 'id' });
    expect(queryInterface.addIndex).toHaveBeenCalledWith(
      'cart_items',
      ['cart_id', 'product_id', 'options_key'],
      { unique: true, name: 'cart_items_line_unique' },
    );

    await migration.down(queryInterface);
    expect(droppedTables).toEqual(['cart_items', 'carts', 'user_addresses']);
  });
});
