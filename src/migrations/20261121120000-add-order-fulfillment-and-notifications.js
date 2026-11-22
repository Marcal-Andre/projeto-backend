'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn('orders', 'fulfillment_status', {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'unfulfilled',
    });
    await queryInterface.addColumn('orders', 'idempotency_key', {
      type: DataTypes.STRING(128),
      allowNull: true,
    });
    await queryInterface.addIndex('orders', ['user_id', 'idempotency_key'], {
      unique: true,
      name: 'orders_user_id_idempotency_key_unique',
    });

    await queryInterface.createTable('order_status_history', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      order_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'orders', key: 'id' },
        onDelete: 'CASCADE',
      },
      actor_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      scope: { type: DataTypes.STRING(20), allowNull: false },
      from_status: { type: DataTypes.STRING(20), allowNull: true },
      to_status: { type: DataTypes.STRING(20), allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await queryInterface.addIndex('order_status_history', ['order_id', 'created_at'], {
      name: 'order_status_history_order_created_at',
    });

    await queryInterface.createTable('notifications', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      order_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'orders', key: 'id' },
        onDelete: 'SET NULL',
      },
      type: { type: DataTypes.STRING(40), allowNull: false },
      message: { type: DataTypes.STRING(255), allowNull: false },
      read_at: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await queryInterface.addIndex('notifications', ['user_id', 'created_at'], {
      name: 'notifications_user_created_at',
    });
    await queryInterface.addIndex('notifications', ['user_id', 'read_at'], {
      name: 'notifications_user_read_at',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('notifications');
    await queryInterface.dropTable('order_status_history');
    await queryInterface.removeIndex('orders', 'orders_user_id_idempotency_key_unique');
    await queryInterface.removeColumn('orders', 'idempotency_key');
    await queryInterface.removeColumn('orders', 'fulfillment_status');
  },
};
