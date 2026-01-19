const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AiTrainingData = sequelize.define('AiTrainingData', {
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
    bankDescription: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'bank_description',
    },
    bookDescription: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'book_description',
    },
    userConfirmedMatch: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      field: 'user_confirmed_match',
    },
    confidenceScore: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      field: 'confidence_score',
    },
    similarityFeatures: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'similarity_features',
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'created_by',
    },
  }, {
    tableName: 'ai_training_data',
    updatedAt: false,
    indexes: [
      { fields: ['account_id'] },
      { fields: ['user_confirmed_match'] },
    ],
  });

  return AiTrainingData;
};