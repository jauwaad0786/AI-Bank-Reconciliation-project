const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Exception = sequelize.define('Exception', {
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
    exceptionType: {
      type: DataTypes.ENUM('unmatched_bank', 'unmatched_book', 'amount_mismatch', 'date_mismatch', 'duplicate'),
      allowNull: false,
      field: 'exception_type',
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
    severity: {
      type: DataTypes.ENUM('low', 'medium', 'high'),
      defaultValue: 'medium',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('pending', 'resolved', 'ignored'),
      defaultValue: 'pending',
    },
    resolvedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'resolved_by',
    },
    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'resolved_at',
    },
    resolutionNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'resolution_notes',
    },
  }, {
    tableName: 'exceptions',
    updatedAt: false,
    indexes: [
      { fields: ['reconciliation_session_id'] },
      { fields: ['exception_type'] },
      { fields: ['severity'] },
      { fields: ['status'] },
    ],
  });

  return Exception;
};
