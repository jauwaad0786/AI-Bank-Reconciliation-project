const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const TransactionCategory = sequelize.define('TransactionCategory', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    accountId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'account_id',
    },
    categoryName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'category_name',
    },
    parentCategoryId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'parent_category_id',
    },
    descriptionPatterns: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'description_patterns',
    },
    amountRanges: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'amount_ranges',
    },
    autoAssign: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'auto_assign',
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'created_by',
    },
  }, {
    tableName: 'transaction_categories',
    indexes: [
      { fields: ['account_id'] },
      { fields: ['parent_category_id'] },
      { fields: ['category_name'] },
    ],
  });

  return TransactionCategory;
};