import sequelize from "../config/db.js";
import { DataTypes } from "sequelize";

const User = sequelize.define(
  "User",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    team_id: {
      type: DataTypes.UUID,
      references: { model: "teams", key: "id" },
    },
    name: { type: DataTypes.STRING(50), allowNull: false },
    email: {
      type: DataTypes.STRING(100),
      unique: true,
      allowNull: false,
    },
    passwordHash: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    role: {
      type: DataTypes.ENUM("admin", "member"),
      defaultValue: "member",
    },
    refreshToken: {
      type: DataTypes.TEXT,
    },
  },
  { tableName: "users", timestamps: true },
);

export default User;
