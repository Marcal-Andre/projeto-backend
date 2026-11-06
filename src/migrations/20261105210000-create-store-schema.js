'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('users', {
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
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });

    await queryInterface.createTable('categories', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      name: { type: DataTypes.STRING(100), allowNull: false },
      slug: { type: DataTypes.STRING(120), allowNull: false, unique: true },
      use_in_menu: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });

    await queryInterface.createTable('products', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      name: { type: DataTypes.STRING(150), allowNull: false },
      slug: { type: DataTypes.STRING(180), allowNull: false, unique: true },
      use_in_menu: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      stock: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      description: { type: DataTypes.TEXT, allowNull: true },
      price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      price_with_discount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });

    await queryInterface.createTable('product_images', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'products', key: 'id' },
        onDelete: 'CASCADE',
      },
      enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      path: { type: DataTypes.STRING(255), allowNull: false },
    });

    await queryInterface.createTable('product_options', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'products', key: 'id' },
        onDelete: 'CASCADE',
      },
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
    });

    await queryInterface.createTable('product_categories', {
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
    });

    await queryInterface.addIndex('product_images', ['product_id']);
    await queryInterface.addIndex('product_options', ['product_id']);
    await queryInterface.addIndex('product_categories', ['category_id']);
    await queryInterface.addIndex('products', ['enabled', 'name']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('product_categories');
    await queryInterface.dropTable('product_options');
    await queryInterface.dropTable('product_images');
    await queryInterface.dropTable('products');
    await queryInterface.dropTable('categories');
    await queryInterface.dropTable('users');
  },
};
