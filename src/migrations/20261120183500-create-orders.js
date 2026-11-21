'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('orders', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      status: {
        type: DataTypes.ENUM('pending', 'paid', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
      },
      total: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
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

    await queryInterface.createTable('order_items', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      order_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'orders', key: 'id' },
        onDelete: 'CASCADE',
      },
      product_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'products', key: 'id' },
        onDelete: 'SET NULL',
      },
      product_name: { type: DataTypes.STRING(150), allowNull: false },
      quantity: { type: DataTypes.INTEGER, allowNull: false },
      unit_price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      selected_options: { type: DataTypes.TEXT, allowNull: false },
    });

    await queryInterface.addIndex('orders', ['user_id', 'created_at']);
    await queryInterface.addIndex('order_items', ['order_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('order_items');
    await queryInterface.dropTable('orders');
  },
};
