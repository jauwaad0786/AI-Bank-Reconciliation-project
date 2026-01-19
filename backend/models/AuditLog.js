const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AuditLog = sequelize.define('AuditLog', {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'user_id',
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    timestamp: {
      type: DataTypes.DATE(6),
      defaultValue: DataTypes.NOW,
    },
    details: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    sessionId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'session_id',
    },
    ipAddress: {
      type: DataTypes.STRING(45),
      allowNull: false,
      field: 'ip_address',
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'user_agent',
    },
    entityType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'entity_type',
    },
    entityId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'entity_id',
    },
    oldValues: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'old_values',
    },
    newValues: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'new_values',
    },
    fieldChanges: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'field_changes',
    },
    businessJustification: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'business_justification',
    },
    regulationImpact: {
      type: DataTypes.ENUM('sox', 'gdpr', 'aml', 'tax', 'none'),
      defaultValue: 'none',
      field: 'regulation_impact',
    },
    sensitivityLevel: {
      type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
      defaultValue: 'medium',
      field: 'sensitivity_level',
    },
    checksum: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
  }, {
    tableName: 'audit_log',
    timestamps: false, // We manage timestamp manually
    indexes: [
      { fields: ['user_id'] },
      { fields: ['timestamp'] },
      { fields: ['entity_type', 'entity_id'] },
      { fields: ['action'] },
      { fields: ['regulation_impact'] },
    ],
  });

  return AuditLog;
};