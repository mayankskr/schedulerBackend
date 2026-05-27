import Agenda from "agenda";
import "dotenv/config";

const agenda = new Agenda({
  db: {
    address: process.env.MONGODB_URI,
    collection: "agendaJobs",
  },
  processEvery: "30 seconds",
  maxConcurrency: 20,
  defaultConcurrency: 5,
});

agenda.on("ready", () => console.log("✅ Agenda job queue ready"));
agenda.on("error", (err) => console.error("❌ Agenda error:", err.message));

export default agenda;