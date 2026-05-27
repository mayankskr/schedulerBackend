import { Queue } from "bullmq";

export const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT) || 6379,
};

const postQueue = new Queue("publishPost", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

postQueue.on("error", (err) =>
  console.error("❌ Queue error:", err.message)
);

export default postQueue;