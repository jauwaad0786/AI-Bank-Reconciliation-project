const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const MatchGroup = sequelize.define('MatchGroup', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    reconciliationSessionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'reconciliation_session_id',
    },
    groupType: {
      type: DataTypes.ENUM('one_to_many', 'many_to_one', 'many_to_many'),
      allowNull: false,
      field: 'group_type',
    },
    totalBankAmount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      field: 'total_bank_amount',
    },
    totalBookAmount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      field: 'total_book_amount',
    },
    amountDifference: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00,
      field: 'amount_difference',
    },
    confidenceScore: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      field: 'confidence_score',
    },
    isApproved: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_approved',
    },
    approvedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'approved_by',
    },
    approvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'approved_at',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'created_by',
    },
  }, {
    tableName: 'match_groups',
    indexes: [
      { fields: ['reconciliation_session_id'] },
      { fields: ['group_type'] },
    ],
  });

  return MatchGroup;
};