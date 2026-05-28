import sequelize from "../config/db.js";
import { DataTypes } from "sequelize";

// FIX (Bug 3): Added `unique: true` on `slot_time`.
//
// `SELECT … FOR UPDATE` in bookSlot only locks *existing* rows.  When no row
// exists at the candidate slot_time, two concurrent transactions both see null,
// skip the collision branch, and race to insert — producing two occupied rows
// at the same time.
//
// The unique constraint gives the DB the final say: even if two transactions
// slip past the application-level check simultaneously, only one INSERT will
// succeed.  The other receives a SequelizeUniqueConstraintError, which
// bookSlot catches and treats as a collision — advancing to the next slot.
//
// Migration note: if you are managing the schema with Sequelize migrations
// rather than sync(), add the following to your create-schedule-slots migration:
//
//   queryInterface.addIndex("schedule_slots", ["slot_time"], { unique: true });

const ScheduleSlot = sequelize.define(
  "ScheduleSlot",
  {
    id: {
      type:         DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey:   true,
    },
    post_id: {
      type:       DataTypes.UUID,
      allowNull:  true,   // null when slot is free
      references: {
        model: "posts",
        key:   "id",
      },
    },
    slot_date: {
      type:      DataTypes.DATEONLY,
      allowNull: false,
    },
    slot_time: {
      type:      DataTypes.DATE,
      allowNull: false,
      unique:    true,   // ← prevents duplicate slot inserts at the DB level
    },
    is_occupied: {
      type:         DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  { tableName: "schedule_slots", timestamps: true }
);

export default ScheduleSlot;