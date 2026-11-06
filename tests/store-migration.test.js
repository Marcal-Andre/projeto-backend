const migration = require('../src/migrations/20261105210000-create-store-schema');

describe('migração inicial da loja', () => {
  it('cria todas as tabelas documentadas com perfil do usuário e relações', async () => {
    const createdTables = [];
    const queryInterface = {
      createTable: jest.fn(async (name, columns) => {
        createdTables.push({ name, columns });
      }),
      addIndex: jest.fn().mockResolvedValue(undefined),
    };

    await migration.up(queryInterface);

    expect(createdTables.map((table) => table.name)).toEqual([
      'users',
      'categories',
      'products',
      'product_images',
      'product_options',
      'product_categories',
    ]);
    expect(createdTables[0].columns.password.allowNull).toBe(false);
    expect(createdTables[0].columns.role.defaultValue).toBe('customer');
    expect(createdTables[4].columns.shape.type.values).toEqual(['square', 'circle']);
    expect(createdTables[5].columns.product_id.references).toEqual({
      model: 'products',
      key: 'id',
    });
    expect(queryInterface.addIndex).toHaveBeenCalledTimes(4);
  });
});
