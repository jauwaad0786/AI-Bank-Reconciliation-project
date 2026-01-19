const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Match = sequelize.define('Match', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    bankTransId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'bank_trans_id',
    },
    bookTransId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'book_trans_id',
    },
    matchType: {
      type: DataTypes.ENUM('one_to_one', 'one_to_many', 'many_to_one', 'many_to_many'),
      defaultValue: 'one_to_one',
      field: 'match_type',
    },
    confidenceScore: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      field: 'confidence_score',
      validate: {
        min: 0,
        max: 100,
      },
    },
    reconciliationSessionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'reconciliation_session_id',
    },
    matchingMethod: {
      type: DataTypes.ENUM('exact', 'tolerance', 'ai_fuzzy', 'manual'),
      allowNull: false,
      field: 'matching_method',
    },
    amountDifference: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00,
      field: 'amount_difference',
    },
    dateDifference: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'date_difference',
    },
    descriptionSimilarity: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      field: 'description_similarity',
      validate: {
        min: 0,
        max: 100,
      },
    },
    isApproved: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_approved',
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
    businessJustification: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'business_justification',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
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
    tableName: 'matches',
    indexes: [
      { fields: ['bank_trans_id'] },
      { fields: ['book_trans_id'] },
      { fields: ['reconciliation_session_id'] },
      { fields: ['match_type'] },
      { fields: ['confidence_score'] },
      { fields: ['is_approved'] },
    ],
    hooks: {
      afterCreate: async (match) => {
        // Update transaction statuses when match is created
        const { BankTransaction, BookTransaction } = sequelize.models;
        
        if (match.bankTransId) {
          await BankTransaction.update(
            { status: 'matched' },
            { where: { id: match.bankTransId } }
          );
        }
        
        if (match.bookTransId) {
          await BookTransaction.update(
            { status: 'matched' },
            { where: { id: match.bookTransId } }
          );
        }
      },
    },
  });

  // Instance methods
  Match.prototype.isHighConfidence = function() {
    return this.confidenceScore >= 90;
  };

  Match.prototype.requiresApproval = function() {
    return this.confidenceScore < 95 || this.amountDifference > 0 || this.dateDifference > 1;
  };

  return Match;
};
