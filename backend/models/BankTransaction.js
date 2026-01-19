// backend/models/bankTransaction.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const BankTransaction = sequelize.define('BankTransaction', {
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
    date: {
      type: DataTypes.DATE,   // ✅ changed from DATEONLY to DATE
      allowNull: false,
      validate: {
        isDate: true,
      },
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        len: [1, 5000],
      },
    },
    amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      validate: {
        isDecimal: true,
      },
    },
    currency: {
      type: DataTypes.STRING(3),
      defaultValue: 'INR',
    },
    counterpartyName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'counterparty_name',
    },
    transactionType: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'transaction_type',
    },
    referenceNumber: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'reference_number',
    },
    originalAmount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true,   // ✅ changed (was false)
      field: 'original_amount',
      validate: {
        isDecimal: true,
      },
    },
    adjustmentAmount: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00,
      field: 'adjustment_amount',
    },
    adjustmentReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'adjustment_reason',
    },
    amlRiskScore: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: true,
      field: 'aml_risk_score',
      validate: {
        min: 0,
        max: 1,
      },
    },
    isSuspicious: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_suspicious',
    },
    status: {
      type: DataTypes.ENUM('pending', 'matched', 'unmatched', 'exception', 'under_review'),
      defaultValue: 'pending',
    },
    uploadedFileId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'uploaded_file_id',
    },
    rowNumber: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'row_number',
    },
    dataClassification: {
      type: DataTypes.ENUM('public', 'internal', 'confidential', 'restricted'),
      defaultValue: 'confidential',
      field: 'data_classification',
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'created_by',
    },
    updatedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'updated_by',
    },
  }, {
    tableName: 'bank_transactions',
    indexes: [
      { fields: ['account_id', 'date'] },
      { fields: ['amount'] },
      { fields: ['status'] },
      { fields: ['reference_number'] },
      { fields: ['is_suspicious'] },
    ],
    hooks: {
      beforeCreate: (transaction) => {
        if (!transaction.originalAmount) {
          transaction.originalAmount = transaction.amount;
        }
      },
    },
  });

  BankTransaction.prototype.isCredit = function() {
    return parseFloat(this.amount) > 0;
  };

  BankTransaction.prototype.isDebit = function() {
    return parseFloat(this.amount) < 0;
  };

  BankTransaction.prototype.getAbsoluteAmount = function() {
    return Math.abs(parseFloat(this.amount));
  };

  return BankTransaction;
};
