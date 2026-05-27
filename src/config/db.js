import { Sequelize } from "sequelize";
import "dotenv/config";

const sequelize = new Sequelize(
  process.env.DB_NAME || "postScheduler",
  process.env.DB_USER || "root",
  process.env.DB_PASS || "satkartar6",
  {
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT || 3306,
    dialect: "mysql",
    logging: false,
  },
);

sequelize
  .authenticate()
  .then(() => console.log("Successfully connected to database"))
  .catch((err) => console.log(err));

export default sequelize;
