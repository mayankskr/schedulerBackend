// Import app and sequelize
import app from "./app.js";
import sequelize from "./config/db.js";

const PORT = process.env.PORT || 4000;

// Start Server using sequelize
sequelize
  .sync({ alter: true })
  .then(() => {
    console.log("Database synced");
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("DB connection failed:", err.message);
    process.exit(1);
  });
