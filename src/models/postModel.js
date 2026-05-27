import sequelize from "../config/db.js";
import { DataTypes } from "sequelize";

const Post = sequelize.define(
  "Post",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      references: {
        model: "users",
        key: "id",
      },
    },
    cloudinary_url: {
      type: DataTypes.TEXT,
    },
    cloudinary_public_id: {
      type: DataTypes.STRING,
    },
    file_type: {
      type: DataTypes.ENUM("image", "video", "audio"),
      allowNull: false,
    },
    caption: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    scheduled_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    keywords: {
      type: DataTypes.JSON,
      defaultValue: [],
    },
    status: {
      type: DataTypes.ENUM(
        "draft",
        "scheduled",
        "published",
        "failed",
        "cancelled",
      ),
      defaultValue: "draft",
    },
    agenda_job_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  },
  { tableName: "posts", timestamps: true },
);

export default Post;
