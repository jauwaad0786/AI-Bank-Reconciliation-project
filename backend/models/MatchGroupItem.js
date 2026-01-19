const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const MatchGroupItem = sequelize.define('MatchGroupItem', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    matchGroupId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'match_group_id',
    },
    bankTransactionId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'bank_transaction_id',
    },
    bookTransactionId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'book_transaction_id',
    },
    allocationAmount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true,
      field: 'allocation_amount',
    },
  }, {
    tableName: 'match_group_items',
    timestamps: false,
    indexes: [
      { fields: ['match_group_id'] },
      { fields: ['bank_transaction_id'] },
      { fields: ['book_transaction_id'] },
    ],
  });

  return MatchGroupItem;
};