'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn('orders', 'expires_at', {
      type: DataTypes.DATE,
      allowNull: true,
    });
    await queryInterface.sequelize.query(
      'UPDATE `orders` SET `expires_at` = CURRENT_TIMESTAMP WHERE `expires_at` IS NULL',
    );
    await queryInterface.changeColumn('orders', 'expires_at', {
      type: DataTypes.DATE,
      allowNull: false,
    });
    await queryInterface.addColumn('orders', 'mercadopago_preference_id', {
      type: DataTypes.STRING(100),
      allowNull: true,
    });
    await queryInterface.addColumn('orders', 'mercadopago_init_point', {
      type: DataTypes.STRING(1000),
      allowNull: true,
    });
    await queryInterface.addColumn('orders', 'mercadopago_payment_id', {
      type: DataTypes.STRING(50),
      allowNull: true,
    });
    await queryInterface.addColumn('orders', 'mercadopago_payment_status', {
      type: DataTypes.STRING(50),
      allowNull: true,
    });
    await queryInterface.addIndex('orders', ['mercadopago_preference_id'], {
      unique: true,
      name: 'orders_mercadopago_preference_id_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('orders', 'orders_mercadopago_preference_id_unique');
    await queryInterface.removeColumn('orders', 'mercadopago_payment_status');
    await queryInterface.removeColumn('orders', 'mercadopago_payment_id');
    await queryInterface.removeColumn('orders', 'mercadopago_init_point');
    await queryInterface.removeColumn('orders', 'mercadopago_preference_id');
    await queryInterface.removeColumn('orders', 'expires_at');
  },
};
