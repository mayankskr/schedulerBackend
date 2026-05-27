import { Sequelize } from "sequelize";
import "dotenv/config";

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: "mysql",
    logging: false,
    timezone: "+05:30",                    // ← IST for Sequelize queries
    dialectOptions: {
      timezone: "+05:30",                  // ← IST for MySQL connection
    },
    pool: {
      max: 10,
      min: 2,
      acquire: 30000,
      idle: 30000,
    },
  }
);

sequelize
  .authenticate()
  .then(() => console.log("✅ Database connected"))
  .catch((err) => {
    console.error("❌ DB connection failed:", err.message);
    process.exit(1);
  });

export default sequelize;