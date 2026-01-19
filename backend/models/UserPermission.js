const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UserPermission = sequelize.define('UserPermission', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'user_id',
    },
    permissionType: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'permission_type',
    },
    resourceType: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'resource_type',
    },
    resourceId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'resource_id',
    },
    grantedBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'granted_by',
    },
    grantedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'granted_at',
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'expires_at',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active',
    },
  }, {
    tableName: 'user_permissions',
    timestamps: false,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['permission_type'] },
      { fields: ['resource_type'] },
      { fields: ['is_active'] },
      { 
        unique: true, 
        fields: ['user_id', 'permission_type', 'resource_type', 'resource_id'],
        name: 'unique_user_permission'
      },
    ],
  });

  return UserPermission;
};