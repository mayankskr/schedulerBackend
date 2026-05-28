import sequelize from "../config/db.js";
import { DataTypes } from "sequelize";

const PostPlatform = sequelize.define(
  "PostPlatform",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    post_id: {
      type: DataTypes.UUID,
      references: {
        model: "posts",
        key: "id",
      },
    },
    platform: {
      type: DataTypes.ENUM("fb", "ig", "yt", "tw"),
      allowNull: false,
    },
    publish_status: {
      type: DataTypes.ENUM("pending", "done", "failed"),
      defaultValue: "pending",
    },
    platform_post_id: {
      type: DataTypes.STRING(255),
    },
    social_account_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "social_accounts", key: "id" },
    },
    error_message: {
      type: DataTypes.TEXT,
    },
  },
  { tableName: "post_platforms", timestamps: true },
);

export default PostPlatform;
