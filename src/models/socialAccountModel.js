// src/models/socialAccountModel.js
import sequelize from '../config/db.js';
import { DataTypes } from 'sequelize';

const SocialAccount = sequelize.define('SocialAccount', {
  id:            { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  team_id:       { type: DataTypes.UUID, allowNull: false },
  platform:      { type: DataTypes.ENUM('fb', 'ig', 'yt', 'tw'), allowNull: false },

  // Human-readable name shown in the UI selector
  label:         { type: DataTypes.STRING(100), allowNull: false }, // "Nike India IG", "Adidas IG"

  // Credentials — encrypted at rest ideally
  access_token:  { type: DataTypes.TEXT, allowNull: false },
  refresh_token: { type: DataTypes.TEXT },
  token_expiry:  { type: DataTypes.DATE },

  // Platform-specific IDs
  account_id:    { type: DataTypes.STRING(100) }, // IG business ID / FB page ID / YT channel ID

  is_active:     { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'social_accounts', timestamps: true });

export default SocialAccount;