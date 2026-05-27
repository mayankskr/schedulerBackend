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
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  { tableName: "teams", timestamps: true },
);

export default Team