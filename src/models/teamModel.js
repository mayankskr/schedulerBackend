import sequelize from "../config/db.js";
import { DataTypes } from "sequelize";

const Team = sequelize.define(
  "Team",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    created_by: {
      type: DataTypes.UUID,
      references: { model: "users", key: "id" },
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  { tableName: "teams", timestamps: true },
);

export default Team;
