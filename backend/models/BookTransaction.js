// backend/models/bookTransaction.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const BookTransaction = sequelize.define('BookTransaction', {
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
    reference: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    currency: {
      type: DataTypes.STRING(3),
      defaultValue: 'INR',
    },
    category: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    subcategory: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    vendorName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'vendor_name',
    },
    invoiceNumber: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'invoice_number',
    },
    originalAmount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true,   // ✅ was false, now true for safety
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
    tableName: 'book_transactions',
    indexes: [
      { fields: ['account_id', 'date'] },
      { fields: ['amount'] },
      { fields: ['status'] },
      { fields: ['reference'] },
      { fields: ['category'] },
      { fields: ['vendor_name'] },
    ],
    hooks: {
      beforeCreate: (transaction) => {
        if (!transaction.originalAmount) {
          transaction.originalAmount = transaction.amount;
        }
      },
    },
  });

  return BookTransaction;
};
