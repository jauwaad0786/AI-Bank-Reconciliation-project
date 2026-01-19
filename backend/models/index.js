const { Sequelize } = require('sequelize');
require('dotenv').config();

// Initialize Sequelize connection
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: 'mysql',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 20,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
    define: {
      underscored: true, // Convert camelCase to snake_case
      freezeTableName: true, // Don't pluralize table names
      timestamps: true, // Enable createdAt and updatedAt
    },
  }
);

// Import all models
const User = require('./User.js')(sequelize);
const Account = require('./Account.js')(sequelize);
const BankTransaction = require('./BankTransaction.js')(sequelize);
const BookTransaction = require('./BookTransaction.js')(sequelize);
const ReconciliationRule = require('./ReconciliationRule.js')(sequelize);
const Match = require('./Match.js')(sequelize);
const UploadedFile = require('./UploadedFile.js')(sequelize);
const ReconciliationSession = require('./ReconciliationSession.js')(sequelize);
const MatchGroup = require('./MatchGroup.js')(sequelize);
const MatchGroupItem = require('./MatchGroupItem.js')(sequelize);
const FileProcessingError = require('./FileProcessingError.js')(sequelize);
const Exception = require('./Exception.js')(sequelize);
const TransactionCategory = require('./TransactionCategory.js')(sequelize);
const AiTrainingData = require('./AiTrainingData.js')(sequelize);
const Anomaly = require('./Anomaly.js')(sequelize);
const UserSession = require('./UserSession.js')(sequelize);
const UserPermission = require('./UserPermission.js')(sequelize);
const Notification = require('./Notification.js')(sequelize);
const SystemSetting = require('./SystemSetting.js')(sequelize);
const AccountSetting = require('./AccountSetting.js')(sequelize);
const DataRetentionPolicy = require('./DataRetentionPolicy.js')(sequelize);
const ReconciliationReport = require('./ReconciliationReport.js')(sequelize);
const SystemPerformanceLog = require('./SystemPerformanceLog.js')(sequelize);
const AuditLog = require('./AuditLog.js')(sequelize);

// Define all associations
const defineAssociations = () => {
  // User associations
  User.hasMany(Account, { foreignKey: 'created_by', as: 'CreatedAccounts' });
  User.hasMany(BankTransaction, { foreignKey: 'created_by', as: 'CreatedBankTransactions' });
  User.hasMany(BookTransaction, { foreignKey: 'created_by', as: 'CreatedBookTransactions' });
  User.hasMany(Match, { foreignKey: 'created_by', as: 'CreatedMatches' });
  User.hasMany(Match, { foreignKey: 'approved_by', as: 'ApprovedMatches' });
  User.hasMany(UserSession, { foreignKey: 'user_id' });
  User.hasMany(Notification, { foreignKey: 'user_id' });
  User.belongsTo(User, { foreignKey: 'manager_id', as: 'Manager' });
  User.hasMany(User, { foreignKey: 'manager_id', as: 'DirectReports' });

  // Account associations
  Account.belongsTo(User, { foreignKey: 'created_by', as: 'Creator' });
  Account.hasMany(BankTransaction, { foreignKey: 'account_id' });
  Account.hasMany(BookTransaction, { foreignKey: 'account_id' });
  Account.hasMany(ReconciliationRule, { foreignKey: 'account_id' });
  Account.hasMany(ReconciliationSession, { foreignKey: 'account_id' });
  Account.hasMany(UploadedFile, { foreignKey: 'account_id' });
  Account.hasMany(AccountSetting, { foreignKey: 'account_id' });
  Account.hasMany(TransactionCategory, { foreignKey: 'account_id' });
  Account.hasMany(AiTrainingData, { foreignKey: 'account_id' });
  Account.hasMany(Anomaly, { foreignKey: 'account_id' });

  // File associations
  UploadedFile.belongsTo(Account, { foreignKey: 'account_id' });
  UploadedFile.belongsTo(User, { foreignKey: 'uploaded_by', as: 'Uploader' });
  UploadedFile.hasMany(BankTransaction, { foreignKey: 'uploaded_file_id' });
  UploadedFile.hasMany(BookTransaction, { foreignKey: 'uploaded_file_id' });
  UploadedFile.hasMany(FileProcessingError, { foreignKey: 'uploaded_file_id' });

  // Transaction associations
  BankTransaction.belongsTo(Account, { foreignKey: 'account_id' });
  BankTransaction.belongsTo(UploadedFile, { foreignKey: 'uploaded_file_id' });
  BankTransaction.belongsTo(User, { foreignKey: 'created_by', as: 'Creator' });
  BankTransaction.hasMany(Match, { foreignKey: 'bank_trans_id' });
  BankTransaction.hasMany(MatchGroupItem, { foreignKey: 'bank_transaction_id' });

  BookTransaction.belongsTo(Account, { foreignKey: 'account_id' });
  BookTransaction.belongsTo(UploadedFile, { foreignKey: 'uploaded_file_id' });
  BookTransaction.belongsTo(User, { foreignKey: 'created_by', as: 'Creator' });
  BookTransaction.hasMany(Match, { foreignKey: 'book_trans_id' });
  BookTransaction.hasMany(MatchGroupItem, { foreignKey: 'book_transaction_id' });

  // Reconciliation associations
  ReconciliationSession.belongsTo(Account, { foreignKey: 'account_id' });
  ReconciliationSession.belongsTo(User, { foreignKey: 'initiated_by', as: 'InitiatedSessions' });
  ReconciliationSession.belongsTo(UploadedFile, { foreignKey: 'bank_file_id', as: 'BankFile' });
  ReconciliationSession.belongsTo(UploadedFile, { foreignKey: 'ledger_file_id', as: 'LedgerFile' });
  ReconciliationSession.hasMany(Match, { foreignKey: 'reconciliation_session_id', as: 'Matches' });
  ReconciliationSession.hasMany(Exception, { foreignKey: 'reconciliation_session_id', as: 'Exceptions' });
  ReconciliationSession.hasMany(MatchGroup, { foreignKey: 'reconciliation_session_id' });
  ReconciliationSession.hasMany(ReconciliationReport, { foreignKey: 'reconciliation_session_id' });

  // Match associations
  Match.belongsTo(BankTransaction, { foreignKey: 'bank_trans_id', as: 'BankTransaction' });
  Match.belongsTo(BookTransaction, { foreignKey: 'book_trans_id', as: 'BookTransaction' });
  Match.belongsTo(ReconciliationSession, { foreignKey: 'reconciliation_session_id' });
  Match.belongsTo(User, { foreignKey: 'created_by', as: 'Creator' });
  Match.belongsTo(User, { foreignKey: 'approved_by', as: 'Approver' });

  // Match Group associations
  MatchGroup.belongsTo(ReconciliationSession, { foreignKey: 'reconciliation_session_id' });
  MatchGroup.belongsTo(User, { foreignKey: 'created_by', as: 'Creator' });
  MatchGroup.belongsTo(User, { foreignKey: 'approved_by', as: 'Approver' });
  MatchGroup.hasMany(MatchGroupItem, { foreignKey: 'match_group_id' });

  MatchGroupItem.belongsTo(MatchGroup, { foreignKey: 'match_group_id' });
  MatchGroupItem.belongsTo(BankTransaction, { foreignKey: 'bank_transaction_id' });
  MatchGroupItem.belongsTo(BookTransaction, { foreignKey: 'book_transaction_id' });

  // Rules and Settings
  ReconciliationRule.belongsTo(Account, { foreignKey: 'account_id' });
  ReconciliationRule.belongsTo(User, { foreignKey: 'created_by', as: 'Creator' });
  ReconciliationRule.belongsTo(User, { foreignKey: 'approved_by', as: 'Approver' });

  // Categories and AI
  TransactionCategory.belongsTo(Account, { foreignKey: 'account_id' });
  TransactionCategory.belongsTo(TransactionCategory, { foreignKey: 'parent_category_id', as: 'ParentCategory' });
  TransactionCategory.hasMany(TransactionCategory, { foreignKey: 'parent_category_id', as: 'SubCategories' });

  AiTrainingData.belongsTo(Account, { foreignKey: 'account_id' });
  AiTrainingData.belongsTo(User, { foreignKey: 'created_by', as: 'Creator' });

  Anomaly.belongsTo(Account, { foreignKey: 'account_id' });
  Anomaly.belongsTo(User, { foreignKey: 'reviewed_by', as: 'Reviewer' });

  // System tables
  UserSession.belongsTo(User, { foreignKey: 'user_id' });
  UserPermission.belongsTo(User, { foreignKey: 'user_id' });
  UserPermission.belongsTo(User, { foreignKey: 'granted_by', as: 'Grantor' });
  
  Notification.belongsTo(User, { foreignKey: 'user_id' });
  
  AccountSetting.belongsTo(Account, { foreignKey: 'account_id' });
  AccountSetting.belongsTo(User, { foreignKey: 'updated_by', as: 'Updater' });
  
  SystemSetting.belongsTo(User, { foreignKey: 'updated_by', as: 'Updater' });
  
  DataRetentionPolicy.belongsTo(User, { foreignKey: 'created_by', as: 'Creator' });
  
  ReconciliationReport.belongsTo(ReconciliationSession, { foreignKey: 'reconciliation_session_id' });
  ReconciliationReport.belongsTo(User, { foreignKey: 'generated_by', as: 'Generator' });

  // Error handling
  FileProcessingError.belongsTo(UploadedFile, { foreignKey: 'uploaded_file_id' });
  
  Exception.belongsTo(ReconciliationSession, { foreignKey: 'reconciliation_session_id' });
  Exception.belongsTo(BankTransaction, { foreignKey: 'bank_transaction_id' });
  Exception.belongsTo(BookTransaction, { foreignKey: 'book_transaction_id' });
  Exception.belongsTo(User, { foreignKey: 'resolved_by', as: 'Resolver' });

  // Audit
  AuditLog.belongsTo(User, { foreignKey: 'user_id' });
};

// Define models object
const models = {
  User,
  Account,
  BankTransaction,
  BookTransaction,
  ReconciliationRule,
  Match,
  UploadedFile,
  ReconciliationSession,
  MatchGroup,
  MatchGroupItem,
  FileProcessingError,
  Exception,
  TransactionCategory,
  AiTrainingData,
  Anomaly,
  UserSession,
  UserPermission,
  Notification,
  SystemSetting,
  AccountSetting,
  DataRetentionPolicy,
  ReconciliationReport,
  SystemPerformanceLog,
  AuditLog,
  sequelize,
  Sequelize,
};

// Initialize associations
defineAssociations();
const setupDatabase = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully.');
    
    // Sync all models (be careful in production!)
    // await sequelize.sync({ alter: true });
    console.log('✅ All models synchronized successfully.');
    
    return sequelize;
  } catch (error) { 
    console.error('❌ Unable to connect to the database:', error);
    throw error;
  }
};

// Add global hooks for audit logging
sequelize.addHook('afterCreate', async (instance, options) => {
  if (instance.constructor.name !== 'AuditLog') {
    try {
      await AuditLog.create({
        userId: instance.createdBy || options.userId,
        action: 'CREATE',
        entityType: instance.constructor.name.toLowerCase(),
        entityId: instance.id,
        newValues: instance.dataValues,
        ipAddress: options.ipAddress || '127.0.0.1',
        userAgent: options.userAgent || 'System',
        timestamp: new Date(),
        regulationImpact: getRegulationImpact(instance.constructor.name),
        sensitivityLevel: getSensitivityLevel(instance.constructor.name),
      });
    } catch (error) {
      console.error('Audit logging failed:', error);
    }
  }
});

sequelize.addHook('afterUpdate', async (instance, options) => {
  if (instance.constructor.name !== 'AuditLog') {
    try {
      await AuditLog.create({
        userId: instance.updatedBy || options.userId,
        action: 'UPDATE',
        entityType: instance.constructor.name.toLowerCase(),
        entityId: instance.id,
        oldValues: instance._previousDataValues,
        newValues: instance.dataValues,
        fieldChanges: getFieldChanges(instance._previousDataValues, instance.dataValues),
        ipAddress: options.ipAddress || '127.0.0.1',
        userAgent: options.userAgent || 'System',
        timestamp: new Date(),
        regulationImpact: getRegulationImpact(instance.constructor.name),
        sensitivityLevel: getSensitivityLevel(instance.constructor.name),
      });
    } catch (error) {
      console.error('Audit logging failed:', error);
    }
  }
});

sequelize.addHook('afterDestroy', async (instance, options) => {
  if (instance.constructor.name !== 'AuditLog') {
    try {
      await AuditLog.create({
        userId: options.userId,
        action: 'DELETE',
        entityType: instance.constructor.name.toLowerCase(),
        entityId: instance.id,
        oldValues: instance.dataValues,
        ipAddress: options.ipAddress || '127.0.0.1',
        userAgent: options.userAgent || 'System',
        timestamp: new Date(),
        regulationImpact: getRegulationImpact(instance.constructor.name),
        sensitivityLevel: 'critical', // Deletions are always critical
      });
    } catch (error) {
      console.error('Audit logging failed:', error);
    }
  }
});

// Helper functions for audit logging
function getRegulationImpact(modelName) {
  const financialModels = ['BankTransaction', 'BookTransaction', 'Match', 'Account'];
  const personalDataModels = ['User', 'UserSession'];
  
  if (financialModels.includes(modelName)) return 'sox';
  if (personalDataModels.includes(modelName)) return 'gdpr';
  return 'none';
}

function getSensitivityLevel(modelName) {
  const criticalModels = ['BankTransaction', 'BookTransaction', 'Match'];
  const highModels = ['Account', 'User', 'ReconciliationSession'];
  const mediumModels = ['ReconciliationRule', 'UserPermission'];
  
  if (criticalModels.includes(modelName)) return 'critical';
  if (highModels.includes(modelName)) return 'high';
  if (mediumModels.includes(modelName)) return 'medium';
  return 'low';
}

function getFieldChanges(oldValues, newValues) {
  const changes = {};
  
  for (const key in newValues) {
    if (oldValues[key] !== newValues[key]) {
      changes[key] = {
        old: oldValues[key],
        new: newValues[key]
      };
    }
  }
  
  return Object.keys(changes).length > 0 ? changes : null;
}

// Validation helpers
const ValidationHelpers = {
  isValidEmail: (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },
  
  isValidAmount: (amount) => {
    return !isNaN(amount) && parseFloat(amount) >= 0;
  },
  
  isValidDate: (date) => {
    return date instanceof Date && !isNaN(date);
  },
  
  isStrongPassword: (password) => {
    // At least 8 characters, 1 uppercase, 1 lowercase, 1 number, 1 special char
    const strongRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return strongRegex.test(password);
  }
};

// Query helpers for common operations
const QueryHelpers = {
  // Get unmatched transactions for an account
  getUnmatchedTransactions: async (accountId, type = 'both') => {
    const whereClause = { 
      account_id: accountId, 
      status: 'unmatched' 
    };
    
    if (type === 'bank') {
      return await BankTransaction.findAll({ where: whereClause });
    } else if (type === 'book') {
      return await BookTransaction.findAll({ where: whereClause });
    } else {
      const [bankTrans, bookTrans] = await Promise.all([
        BankTransaction.findAll({ where: whereClause }),
        BookTransaction.findAll({ where: whereClause })
      ]);
      return { bankTrans, bookTrans };
    }
  },
  
  // Get reconciliation statistics
  getReconciliationStats: async (sessionId) => {
    const session = await ReconciliationSession.findByPk(sessionId, {
      include: [
        { model: Match, as: 'Matches' },
        { model: Exception, as: 'Exceptions' }
      ]
    });
    
    return {
      totalMatches: session.matched_pairs,
      matchRate: session.getMatchRate(),
      pendingExceptions: session.Exceptions?.filter(e => e.status === 'pending').length || 0,
      highConfidenceMatches: session.Matches?.filter(m => m.confidence_score >= 90).length || 0
    };
  },
  
  // Get user dashboard data
  getUserDashboard: async (userId) => {
    const user = await User.findByPk(userId, {
      include: [
        { model: Notification, where: { is_read: false }, required: false },
        { model: ReconciliationSession, as: 'InitiatedSessions', limit: 5, order: [['created_at', 'DESC']] }
      ]
    });
    
    return {
      user: user.toJSON(),
      unreadNotifications: user.Notifications?.length || 0,
      recentSessions: user.InitiatedSessions || []
    };
  }
};

module.exports = {
  ...models,
  setupDatabase,
  ValidationHelpers,
  QueryHelpers,
};
