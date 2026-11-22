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

const UserAddress = sequelize.define('UserAddress', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  postal_code: { type: DataTypes.STRING(8), allowNull: false },
  street: { type: DataTypes.STRING(180), allowNull: false },
  number: { type: DataTypes.STRING(20), allowNull: false },
  complement: { type: DataTypes.STRING(100), allowNull: false, defaultValue: '' },
  neighborhood: { type: DataTypes.STRING(100), allowNull: false },
  city: { type: DataTypes.STRING(100), allowNull: false },
  state: { type: DataTypes.STRING(2), allowNull: false },
}, {
  ...timestamps,
  tableName: 'user_addresses',
});

const Cart = sequelize.define('Cart', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
}, {
  ...timestamps,
  tableName: 'carts',
});

const CartItem = sequelize.define('CartItem', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  cart_id: { type: DataTypes.INTEGER, allowNull: false },
  product_id: { type: DataTypes.INTEGER, allowNull: false },
  quantity: { type: DataTypes.INTEGER, allowNull: false },
  selected_options: { type: DataTypes.TEXT, allowNull: false },
  options_key: { type: DataTypes.STRING(64), allowNull: false },
}, {
  ...timestamps,
  tableName: 'cart_items',
  indexes: [{
    unique: true,
    fields: ['cart_id', 'product_id', 'options_key'],
    name: 'cart_items_line_unique',
  }],
});

const Order = sequelize.define('Order', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  user_id: { type: DataTypes.INTEGER, allowNull: true },
  status: {
    type: DataTypes.ENUM('pending', 'paid', 'cancelled'),
    allowNull: false,
    defaultValue: 'pending',
  },
  fulfillment_status: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'unfulfilled',
  },
  idempotency_key: { type: DataTypes.STRING(128), allowNull: true },
  expires_at: { type: DataTypes.DATE, allowNull: false },
  total: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  mercadopago_preference_id: { type: DataTypes.STRING(100), allowNull: true, unique: true },
  mercadopago_init_point: { type: DataTypes.STRING(1000), allowNull: true },
  mercadopago_payment_id: { type: DataTypes.STRING(50), allowNull: true },
  mercadopago_payment_status: { type: DataTypes.STRING(50), allowNull: true },
  postal_code: { type: DataTypes.STRING(8), allowNull: false },
  street: { type: DataTypes.STRING(180), allowNull: false },
  number: { type: DataTypes.STRING(20), allowNull: false },
  complement: { type: DataTypes.STRING(100), allowNull: false, defaultValue: '' },
  neighborhood: { type: DataTypes.STRING(100), allowNull: false },
  city: { type: DataTypes.STRING(100), allowNull: false },
  state: { type: DataTypes.STRING(2), allowNull: false },
}, {
  ...timestamps,
  tableName: 'orders',
  indexes: [{
    unique: true,
    fields: ['user_id', 'idempotency_key'],
    name: 'orders_user_id_idempotency_key_unique',
  }],
});

const OrderStatusHistory = sequelize.define('OrderStatusHistory', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  order_id: { type: DataTypes.INTEGER, allowNull: false },
  actor_user_id: { type: DataTypes.INTEGER, allowNull: true },
  scope: { type: DataTypes.STRING(20), allowNull: false },
  from_status: { type: DataTypes.STRING(20), allowNull: true },
  to_status: { type: DataTypes.STRING(20), allowNull: false },
  created_at: { type: DataTypes.DATE, allowNull: false },
}, {
  timestamps: false,
  tableName: 'order_status_history',
});

const Notification = sequelize.define('Notification', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  order_id: { type: DataTypes.INTEGER, allowNull: true },
  type: { type: DataTypes.STRING(40), allowNull: false },
  message: { type: DataTypes.STRING(255), allowNull: false },
  read_at: { type: DataTypes.DATE, allowNull: true },
  created_at: { type: DataTypes.DATE, allowNull: false },
}, {
  timestamps: false,
  tableName: 'notifications',
});

const OrderItem = sequelize.define('OrderItem', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  order_id: { type: DataTypes.INTEGER, allowNull: false },
  product_id: { type: DataTypes.INTEGER, allowNull: true },
  product_name: { type: DataTypes.STRING(150), allowNull: false },
  quantity: { type: DataTypes.INTEGER, allowNull: false },
  unit_price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  selected_options: { type: DataTypes.TEXT, allowNull: false },
}, {
  timestamps: false,
  tableName: 'order_items',
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

User.hasOne(UserAddress, { as: 'address', foreignKey: 'user_id', onDelete: 'CASCADE' });
UserAddress.belongsTo(User, { foreignKey: 'user_id' });
User.hasOne(Cart, { as: 'cart', foreignKey: 'user_id', onDelete: 'CASCADE' });
Cart.belongsTo(User, { foreignKey: 'user_id' });
Cart.hasMany(CartItem, { as: 'items', foreignKey: 'cart_id', onDelete: 'CASCADE' });
CartItem.belongsTo(Cart, { foreignKey: 'cart_id' });
CartItem.belongsTo(Product, { as: 'product', foreignKey: 'product_id' });
User.hasMany(Order, { as: 'orders', foreignKey: 'user_id', onDelete: 'SET NULL' });
Order.belongsTo(User, { foreignKey: 'user_id' });
Order.hasMany(OrderItem, { as: 'items', foreignKey: 'order_id', onDelete: 'CASCADE' });
OrderItem.belongsTo(Order, { foreignKey: 'order_id' });
OrderItem.belongsTo(Product, { as: 'product', foreignKey: 'product_id' });
Order.hasMany(OrderStatusHistory, {
  as: 'statusHistory',
  foreignKey: 'order_id',
  onDelete: 'CASCADE',
});
OrderStatusHistory.belongsTo(Order, { foreignKey: 'order_id' });
OrderStatusHistory.belongsTo(User, { as: 'actor', foreignKey: 'actor_user_id' });
User.hasMany(Notification, { as: 'notifications', foreignKey: 'user_id', onDelete: 'CASCADE' });
Notification.belongsTo(User, { foreignKey: 'user_id' });
Order.hasMany(Notification, { as: 'notifications', foreignKey: 'order_id', onDelete: 'SET NULL' });
Notification.belongsTo(Order, { foreignKey: 'order_id' });

module.exports = {
  sequelize,
  User,
  UserAddress,
  Cart,
  CartItem,
  Order,
  OrderStatusHistory,
  Notification,
  OrderItem,
  Category,
  Product,
  ProductImage,
  ProductOption,
  ProductCategory,
};
