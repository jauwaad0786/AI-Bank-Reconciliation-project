const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Anomaly = sequelize.define('Anomaly', {
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
    transactionType: {
      type: DataTypes.ENUM('bank', 'book'),
      allowNull: false,
      field: 'transaction_type',
    },
    transactionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'transaction_id',
    },
    anomalyType: {
      type: DataTypes.ENUM('unusual_amount', 'new_payee', 'frequency_spike', 'pattern_deviation'),
      allowNull: false,
      field: 'anomaly_type',
    },
    severity: {
      type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    aiConfidence: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      field: 'ai_confidence',
      validate: {
        min: 0,
        max: 1,
      },
    },
    status: {
      type: DataTypes.ENUM('pending', 'reviewed', 'false_positive', 'confirmed'),
      defaultValue: 'pending',
    },
    reviewedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'reviewed_by',
    },
    reviewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'reviewed_at',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    detectedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'detected_at',
    },
  }, {
    tableName: 'anomalies',
    indexes: [
      { fields: ['account_id'] },
      { fields: ['anomaly_type'] },
      { fields: ['severity'] },
      { fields: ['status'] },
    ],
  });

  return Anomaly;
};