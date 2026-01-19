const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Account = sequelize.define('Account', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    accountName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'account_name',
      validate: {
        len: [3, 255],
      },
    },
    bankName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'bank_name',
      validate: {
        len: [2, 255],
      },
    },
    accountNumber: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'account_number',
      validate: {
        len: [5, 50],
      },
    },
    accountType: {
      type: DataTypes.ENUM('savings', 'current', 'cc_od', 'loan'),
      defaultValue: 'current',
      field: 'account_type',
    },
    currency: {
      type: DataTypes.STRING(3),
      defaultValue: 'INR',
      validate: {
        len: [3, 3],
      },
    },
    openingBalance: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00,
      field: 'opening_balance',
      validate: {
        isDecimal: true,
      },
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active',
    },
    dataClassification: {
      type: DataTypes.ENUM('public', 'internal', 'confidential', 'restricted'),
      defaultValue: 'confidential',
      field: 'data_classification',
    },
    retentionCategory: {
      type: DataTypes.STRING(50),
      defaultValue: 'financial_7_years',
      field: 'retention_category',
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'created_by',
    },
    updatedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'updated_by',
    },
  }, {
    tableName: 'accounts',
    indexes: [
      { fields: ['account_number'] },
      { fields: ['bank_name'] },
      { fields: ['is_active'] },
    ],
  });

  // Instance methods
  Account.prototype.getMaskedAccountNumber = function() {
    const num = this.accountNumber;
    return num.slice(0, 4) + '*'.repeat(num.length - 8) + num.slice(-4);
  };

  return Account;
};