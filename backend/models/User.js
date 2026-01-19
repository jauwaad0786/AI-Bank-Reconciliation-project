const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'password_hash',
    },
    firstName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'first_name',
      validate: {
        len: [2, 100],
      },
    },
    lastName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'last_name',
      validate: {
        len: [2, 100],
      },
    },
    role: {
      type: DataTypes.ENUM('admin', 'finance_analyst', 'finance_manager', 'auditor'),
      allowNull: false,
      validate: {
        isIn: [['admin', 'finance_analyst', 'finance_manager', 'auditor']],
      },
    },
    employeeId: {
      type: DataTypes.STRING(50),
      allowNull: true,
      unique: true,
      field: 'employee_id',
    },
    department: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    managerId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'manager_id',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active',
    },
    lastLogin: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_login',
    },
    failedLoginAttempts: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'failed_login_attempts',
    },
    accountLockedUntil: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'account_locked_until',
    },
    gdprConsent: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'gdpr_consent',
    },
    gdprConsentDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'gdpr_consent_date',
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'created_by',
    },
    updatedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'updated_by',
    },
  }, {
    tableName: 'users',
    indexes: [
      { fields: ['email'] },
      { fields: ['role'] },
      { fields: ['employee_id'] },
      { fields: ['is_active'] },
    ],
    hooks: {
      beforeCreate: (user) => {
        user.createdBy = user.createdBy || user.id;
      },
      beforeUpdate: (user) => {
        user.updatedBy = user.updatedBy || user.id;
      },
    },
  });

  // Instance methods
  User.prototype.getFullName = function() {
    return `${this.firstName} ${this.lastName}`;
  };

  User.prototype.isManager = function() {
    return this.role === 'finance_manager' || this.role === 'admin';
  };

  User.prototype.canApprove = function() {
    return ['finance_manager', 'admin'].includes(this.role);
  };

  // Class methods
  User.findActiveUsers = function() {
    return this.findAll({ where: { isActive: true } });
  };

  return User;
};