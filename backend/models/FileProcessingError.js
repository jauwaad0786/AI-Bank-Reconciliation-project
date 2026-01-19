const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const FileProcessingError = sequelize.define('FileProcessingError', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    uploadedFileId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'uploaded_file_id',
    },
    rowNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'row_number',
    },
    columnName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'column_name',
    },
    errorType: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'error_type',
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'error_message',
    },
    rawData: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'raw_data',
    },
  }, {
    tableName: 'file_processing_errors',
    updatedAt: false,
    indexes: [
      { fields: ['uploaded_file_id'] },
      { fields: ['error_type'] },
    ],
  });

  return FileProcessingError;
};