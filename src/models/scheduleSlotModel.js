import sequelize from "../config/db.js";
import { DataTypes } from "sequelize";

const ScheduleSlot = sequelize.define(
  "ScheduleSlot",
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
    slot_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    slot_time: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    is_occupied: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  { tableName: "schedule_slots", timestamps: true },
);

export default ScheduleSlot;