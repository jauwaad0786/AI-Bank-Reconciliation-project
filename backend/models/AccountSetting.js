const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AccountSetting = sequelize.define('AccountSetting', {
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
    settingKey: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'setting_key',
    },
    settingValue: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'setting_value',
    },
    dataType: {
      type: DataTypes.ENUM('string', 'number', 'boolean', 'json'),
      defaultValue: 'string',
      field: 'data_type',
    },
    updatedBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'updated_by',
    },
  }, {
    tableName: 'account_settings',
    createdAt: false,
    indexes: [
      { fields: ['account_id'] },
      { fields: ['setting_key'] },
      { 
        unique: true, 
        fields: ['account_id', 'setting_key'],
        name: 'unique_account_setting'
      },
    ],
  });

  return AccountSetting;
};