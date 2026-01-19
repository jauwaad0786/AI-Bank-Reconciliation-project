const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ReconciliationSession = sequelize.define('ReconciliationSession', {
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
    initiatedBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'initiated_by',
    },
    sessionName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'session_name',
    },
    periodFrom: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: 'period_from',
    },
    periodTo: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: 'period_to',
    },
    bankFileId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'bank_file_id',
    },
    ledgerFileId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'ledger_file_id',
    },
    totalBankTransactions: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'total_bank_transactions',
    },
    totalBookTransactions: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'total_book_transactions',
    },
    matchedPairs: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'matched_pairs',
    },
    unmatchedBank: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'unmatched_bank',
    },
    unmatchedBook: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'unmatched_book',
    },
    autoMatchCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'auto_match_count',
    },
    manualMatchCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'manual_match_count',
    },
    aiMatchCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'ai_match_count',
    },
    status: {
      type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed'),
      defaultValue: 'pending',
    },
    startedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'started_at',
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at',
    },
  }, {
    tableName: 'reconciliation_sessions',
    indexes: [
      { fields: ['account_id'] },
      { fields: ['status'] },
      { fields: ['period_from', 'period_to'] },
    ],
  });

  // Instance methods
  ReconciliationSession.prototype.getMatchRate = function() {
    if (this.totalBankTransactions === 0 && this.totalBookTransactions === 0) return 0;
    const total = Math.max(this.totalBankTransactions, this.totalBookTransactions);
    return (this.matchedPairs / total) * 100;
  };

  ReconciliationSession.prototype.isComplete = function() {
    return this.status === 'completed';
  };

  return ReconciliationSession;
};
