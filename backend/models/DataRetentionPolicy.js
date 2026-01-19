const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const DataRetentionPolicy = sequelize.define('DataRetentionPolicy', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    policyName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      field: 'policy_name',
    },
    entityType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'entity_type',
    },
    retentionPeriodYears: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'retention_period_years',
    },
    legalBasis: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'legal_basis',
    },
    regulationReference: {
      type: DataTypes.STRING(200),
      allowNull: true,
      field: 'regulation_reference',
    },
    archiveAfterYears: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'archive_after_years',
    },
    deleteAfterYears: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'delete_after_years',
    },
    encryptionRequired: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'encryption_required',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'created_by',
    },
  }, {
    tableName: 'data_retention_policies',
    indexes: [
      { fields: ['policy_name'] },
      { fields: ['entity_type'] },
    ],
  });

  return DataRetentionPolicy;
};