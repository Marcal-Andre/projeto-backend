jest.mock('../src/models', () => ({
  Category: { findAndCountAll: jest.fn() },
  Product: { findAndCountAll: jest.fn() },
  ProductOption: { findAll: jest.fn() },
  ProductCategory: { findAll: jest.fn() },
  ProductImage: {},
  sequelize: {},
}));

const {
  Category,
  Product,
  ProductOption,
  ProductCategory,
} = require('../src/models');
const categoryController = require('../src/controllers/categoryController');
const productController = require('../src/controllers/productController');

describe('busca do catálogo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('filtra e pagina categorias com os parâmetros documentados', async () => {
    const categories = [{ id: 2, name: 'Calçados', slug: 'calcados', use_in_menu: true }];
    Category.findAndCountAll.mockResolvedValue({ rows: categories, count: 5 });
    const res = { json: jest.fn() };

    await categoryController.search({
      query: {
        limit: '2',
        page: '2',
        fields: 'name,slug',
        use_in_menu: 'true',
      },
    }, res);

    expect(Category.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({
      where: { use_in_menu: true },
      attributes: ['name', 'slug'],
      limit: 2,
      offset: 2,
    }));
    expect(res.json).toHaveBeenCalledWith({
      data: categories,
      total: 5,
      limit: 2,
      page: 2,
    });
  });

  it('combina filtro de categoria, opção, preço e termo de busca em produtos', async () => {
    ProductCategory.findAll.mockResolvedValue([{ product_id: 7 }, { product_id: 8 }]);
    ProductOption.findAll.mockResolvedValue([
      { product_id: 7, values: 'PP,GG' },
      { product_id: 8, values: 'M,GG' },
    ]);
    const record = {
      get: () => ({
        id: 7,
        enabled: true,
        name: 'Tênis de corrida',
        slug: 'tenis-corrida',
        use_in_menu: true,
        stock: 5,
        description: 'Tênis leve',
        price: '19.99',
        price_with_discount: '15.99',
        categories: [{ id: 4 }],
        images: [{ id: 12, path: 'product-images/image.jpg', enabled: false }],
        options: [{
          id: 2,
          title: 'Tamanho',
          shape: 'square',
          radius: 0,
          type: 'text',
          values: 'PP,GG',
        }],
      }),
    };
    Product.findAndCountAll.mockResolvedValue({ rows: [record], count: 1 });
    const res = { json: jest.fn() };

    await productController.search({
      query: {
        limit: '12',
        page: '1',
        fields: 'id,name,price,category_ids,images,options',
        match: 'Tênis',
        category_ids: '4,5',
        'price-range': '10-20',
        option: { 2: 'PP' },
      },
    }, res);

    expect(Product.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: { [require('sequelize').Op.in]: [7] } }),
      limit: 12,
      offset: 0,
      distinct: true,
    }));
    const query = Product.findAndCountAll.mock.calls[0][0];
    expect(query.where.price[require('sequelize').Op.between]).toEqual(['10', '20']);
    expect(res.json).toHaveBeenCalledWith({
      data: [{
        id: 7,
        name: 'Tênis de corrida',
        price: 19.99,
        category_ids: [4],
        images: [{
          id: 12,
          content: '/media/product-images/image.jpg',
          enabled: false,
        }],
        options: [{
          id: 2,
          title: 'Tamanho',
          shape: 'square',
          radius: 0,
          type: 'text',
          values: ['PP', 'GG'],
        }],
      }],
      total: 1,
      limit: 12,
      page: 1,
    });
  });

  it('rejeita parâmetros de consulta repetidos com formato ambíguo', async () => {
    await expect(productController.search({
      query: { 'price-range': ['10-20', '30-40'] },
    }, { json: jest.fn() })).rejects.toMatchObject({ status: 400 });
    expect(Product.findAndCountAll).not.toHaveBeenCalled();
  });
});
