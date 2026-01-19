const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SystemSetting = sequelize.define('SystemSetting', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    settingKey: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
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
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    isEditable: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_editable',
    },
    updatedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'updated_by',
    },
  }, {
    tableName: 'system_settings',
    createdAt: false,
    indexes: [
      { fields: ['setting_key'] },
      { fields: ['data_type'] },
    ],
  });

  return SystemSetting;
};
