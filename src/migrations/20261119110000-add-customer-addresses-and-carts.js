'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('user_addresses', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      postal_code: { type: DataTypes.STRING(8), allowNull: false },
      street: { type: DataTypes.STRING(180), allowNull: false },
      number: { type: DataTypes.STRING(20), allowNull: false },
      complement: { type: DataTypes.STRING(100), allowNull: false, defaultValue: '' },
      neighborhood: { type: DataTypes.STRING(100), allowNull: false },
      city: { type: DataTypes.STRING(100), allowNull: false },
      state: { type: DataTypes.STRING(2), allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });

    await queryInterface.createTable('carts', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });

    await queryInterface.createTable('cart_items', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      cart_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'carts', key: 'id' },
        onDelete: 'CASCADE',
      },
      product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'products', key: 'id' },
        onDelete: 'CASCADE',
      },
      quantity: { type: DataTypes.INTEGER, allowNull: false },
      selected_options: { type: DataTypes.TEXT, allowNull: false },
      options_key: { type: DataTypes.STRING(64), allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });

    await queryInterface.addIndex('cart_items', ['cart_id', 'product_id', 'options_key'], {
      unique: true,
      name: 'cart_items_line_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('cart_items');
    await queryInterface.dropTable('carts');
    await queryInterface.dropTable('user_addresses');
  },
};
