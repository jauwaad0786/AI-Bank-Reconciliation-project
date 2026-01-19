const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SystemPerformanceLog = sequelize.define('SystemPerformanceLog', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    operationType: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'operation_type',
    },
    operationDetails: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'operation_details',
    },
    durationMs: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'duration_ms',
    },
    memoryUsageMb: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: 'memory_usage_mb',
    },
    cpuUsagePercent: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      field: 'cpu_usage_percent',
    },
    status: {
      type: DataTypes.ENUM('success', 'error', 'timeout'),
      allowNull: false,
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'error_message',
    },
  }, {
    tableName: 'system_performance_logs',
    updatedAt: false,
    indexes: [
      { fields: ['operation_type'] },
      { fields: ['duration_ms'] },
      { fields: ['status'] },
      { fields: ['created_at'] },
    ],
  });

  return SystemPerformanceLog;
};