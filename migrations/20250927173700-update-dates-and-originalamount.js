'use strict';

module.exports = {
  async up (queryInterface, Sequelize) {
    // ✅ Update bank_transactions table
    await queryInterface.changeColumn('bank_transactions', 'date', {
      type: Sequelize.DATE,
      allowNull: false,
    });

    await queryInterface.changeColumn('bank_transactions', 'original_amount', {
      type: Sequelize.DECIMAL(15, 2),
      allowNull: true, // ab null allow hai
    });

    // ✅ Update book_transactions table
    await queryInterface.changeColumn('book_transactions', 'date', {
      type: Sequelize.DATE,
      allowNull: false,
    });

    await queryInterface.changeColumn('book_transactions', 'original_amount', {
      type: Sequelize.DECIMAL(15, 2),
      allowNull: true,
    });
  },

  async down (queryInterface, Sequelize) {
    // 🔄 Rollback changes agar zarurat ho
    await queryInterface.changeColumn('bank_transactions', 'date', {
      type: Sequelize.DATEONLY,
      allowNull: false,
    });

    await queryInterface.changeColumn('bank_transactions', 'original_amount', {
      type: Sequelize.DECIMAL(15, 2),
      allowNull: false,
    });

    await queryInterface.changeColumn('book_transactions', 'date', {
      type: Sequelize.DATEONLY,
      allowNull: false,
    });

    await queryInterface.changeColumn('book_transactions', 'original_amount', {
      type: Sequelize.DECIMAL(15, 2),
      allowNull: false,
    });
  }
};
