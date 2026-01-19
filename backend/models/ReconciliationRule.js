const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ReconciliationRule = sequelize.define('ReconciliationRule', {
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
    ruleType: {
      type: DataTypes.ENUM('date_tolerance', 'amount_tolerance', 'description_pattern', 'auto_match', 'ignore_keywords'),
      allowNull: false,
      field: 'rule_type',
    },
    ruleConfig: {
      type: DataTypes.JSON,
      allowNull: false,
      field: 'rule_config',
    },
    ruleName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'rule_name',
    },
    priority: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active',
    },
    businessJustification: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'business_justification',
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
    tableName: 'reconciliation_rules',
    indexes: [
      { fields: ['account_id'] },
      { fields: ['rule_type'] },
      { fields: ['priority'] },
      { fields: ['is_active'] },
    ],
  });

  return ReconciliationRule;
};
