const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UploadedFile = sequelize.define('UploadedFile', {
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
    uploadedBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'uploaded_by',
      defaultValue: 1, // ✅ fallback user
    },
    originalFilename: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'original_filename',
    },
    storedFilename: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'stored_filename',
    },
    filePath: {
      type: DataTypes.STRING(500),
      allowNull: false,
      field: 'file_path',
    },
    fileSize: {
      type: DataTypes.BIGINT,
      allowNull: false,
      field: 'file_size',
    },
    fileType: {
      type: DataTypes.ENUM('bank_statement', 'ledger', 'other'),
      allowNull: false,
      field: 'file_type',
    },
    fileFormat: {
      type: DataTypes.STRING(10), // ✅ allow any extension, not just ENUM
      allowNull: false,
      field: 'file_format',
    },
    totalRows: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'total_rows',
    },
    processedRows: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'processed_rows',
    },
    errorRows: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'error_rows',
    },
    processingStatus: {
      type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed'),
      defaultValue: 'pending',
      field: 'processing_status',
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'error_message',
    },
    columnMapping: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'column_mapping',
    },
    processingDetails: {
      type: DataTypes.JSON, // ✅ Added for AI/fallback details
      allowNull: true,
      field: 'processing_details',
    },
  }, {
    tableName: 'uploaded_files',
    indexes: [
      { fields: ['account_id'] },
      { fields: ['uploaded_by'] },
      { fields: ['file_type'] },
      { fields: ['processing_status'] },
    ],
  });

  // Instance methods
  UploadedFile.prototype.getProcessingRate = function () {
    if (this.totalRows === 0) return 0;
    return (this.processedRows / this.totalRows) * 100;
  };

  UploadedFile.prototype.hasErrors = function () {
    return this.errorRows > 0;
  };

  return UploadedFile;
};
