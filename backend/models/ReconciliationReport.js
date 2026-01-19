const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ReconciliationReport = sequelize.define('ReconciliationReport', {
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
    reportType: {
      type: DataTypes.ENUM('summary', 'detailed', 'exceptions', 'audit'),
      allowNull: false,
      field: 'report_type',
    },
    generatedBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'generated_by',
    },
    filePath: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'file_path',
    },
    fileFormat: {
      type: DataTypes.ENUM('pdf', 'excel', 'csv'),
      allowNull: false,
      field: 'file_format',
    },
    parameters: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    generatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'generated_at',
    },
  }, {
    tableName: 'reconciliation_reports',
    timestamps: false,
    indexes: [
      { fields: ['reconciliation_session_id'] },
      { fields: ['report_type'] },
      { fields: ['generated_by'] },
    ],
  });

  return ReconciliationReport;
};