const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const timestamps = {
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: true,
};

const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  firstname: { type: DataTypes.STRING(100), allowNull: false },
  surname: { type: DataTypes.STRING(100), allowNull: false },
  email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
  password: { type: DataTypes.STRING(255), allowNull: false },
  role: {
    type: DataTypes.ENUM('customer', 'admin'),
    allowNull: false,
    defaultValue: 'customer',
  },
}, {
  ...timestamps,
  tableName: 'users',
  defaultScope: {
    attributes: { exclude: ['password'] },
  },
  scopes: {
    withPassword: { attributes: {} },
  },
});

const Category = sequelize.define('Category', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  slug: { type: DataTypes.STRING(120), allowNull: false, unique: true },
  use_in_menu: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, {
  ...timestamps,
  tableName: 'categories',
});

const Product = sequelize.define('Product', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  name: { type: DataTypes.STRING(150), allowNull: false },
  slug: { type: DataTypes.STRING(180), allowNull: false, unique: true },
  use_in_menu: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  stock: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  description: { type: DataTypes.TEXT, allowNull: true },
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  price_with_discount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
}, {
  ...timestamps,
  tableName: 'products',
});

const ProductImage = sequelize.define('ProductImage', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  product_id: { type: DataTypes.INTEGER, allowNull: false },
  enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  path: { type: DataTypes.STRING(255), allowNull: false },
}, {
  timestamps: false,
  tableName: 'product_images',
});

const ProductOption = sequelize.define('ProductOption', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  product_id: { type: DataTypes.INTEGER, allowNull: false },
  title: { type: DataTypes.STRING(100), allowNull: false },
  shape: {
    type: DataTypes.ENUM('square', 'circle'),
    allowNull: false,
    defaultValue: 'square',
  },
  radius: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  type: {
    type: DataTypes.ENUM('text', 'color'),
    allowNull: false,
    defaultValue: 'text',
  },
  values: { type: DataTypes.STRING(1000), allowNull: false },
}, {
  timestamps: false,
  tableName: 'product_options',
});

const ProductCategory = sequelize.define('ProductCategory', {
  product_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    references: { model: 'products', key: 'id' },
    onDelete: 'CASCADE',
  },
  category_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    references: { model: 'categories', key: 'id' },
    onDelete: 'CASCADE',
  },
}, {
  timestamps: false,
  tableName: 'product_categories',
});

Product.hasMany(ProductImage, { as: 'images', foreignKey: 'product_id', onDelete: 'CASCADE' });
ProductImage.belongsTo(Product, { foreignKey: 'product_id' });
Product.hasMany(ProductOption, { as: 'options', foreignKey: 'product_id', onDelete: 'CASCADE' });
ProductOption.belongsTo(Product, { foreignKey: 'product_id' });
Product.belongsToMany(Category, {
  as: 'categories',
  through: ProductCategory,
  foreignKey: 'product_id',
  otherKey: 'category_id',
});
Category.belongsToMany(Product, {
  as: 'products',
  through: ProductCategory,
  foreignKey: 'category_id',
  otherKey: 'product_id',
});

module.exports = {
  sequelize,
  User,
  Category,
  Product,
  ProductImage,
  ProductOption,
  ProductCategory,
};
