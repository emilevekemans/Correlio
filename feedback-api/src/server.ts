import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import feedbackRoutes from "./routes/feedback";
import { connectDb } from "./db";

dotenv.config();

async function main() {
  const app = express();

  app.use(express.json({ limit: "1mb" }));

  const origins = (process.env.CORS_ORIGIN || "*")
    .split(",")
    .map((s) => s.trim());

  app.use(
    cors({
      origin: origins.includes("*") ? true : origins,
      credentials: true
    })
  );

  // ✅ toujours présent
  app.get("/health", (_req, res) => res.json({ ok: true }));

  // routes feedback
  app.use("/", feedbackRoutes);

  const port = parseInt(process.env.PORT || "8080", 10);

  // ✅ IMPORTANT : on démarre d'abord le serveur
  // puis on connecte Mongo (comme ça /health répond même si Mongo est KO)
  app.listen(port, () => {
    console.log(`✅ LISTENING on http://localhost:${port}`);
  });

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log("⚠️ MONGODB_URI missing (Mongo not connected yet). /health still works.");
    return;
  }

  try {
    await connectDb(uri);
  } catch (e) {
    console.error("❌ MongoDB connection failed:", e);
  }
}

main().catch((err) => {
  console.error("❌ Failed to start:", err);
  process.exit(1);
});
