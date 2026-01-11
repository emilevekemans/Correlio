import { Router } from "express";
import { z } from "zod";
import { Feedback } from "../models/Feedback";

const router = Router();

const FeedbackPayload = z.object({
  message: z.string().min(3).max(2000),

  email: z.string().email().optional().nullable(),
  provider: z.string().max(50).optional().nullable(),
  userId: z.string().max(128).optional().nullable(),

  page: z.string().max(200).optional().nullable(),
  selectedAssets: z.array(z.string()).max(10).optional().nullable(),

  yearStart: z.number().int().optional().nullable(),
  yearEnd: z.number().int().optional().nullable(),
  capPct: z.number().optional().nullable(),
  rollingWindowMonths: z.number().int().optional().nullable(),

  metaJson: z.string().max(5000).optional().nullable()
});

router.post("/feedback", async (req, res) => {
  const parsed = FeedbackPayload.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const p = parsed.data;

  let meta: any = null;
  if (p.metaJson) {
    try {
      meta = JSON.parse(p.metaJson);
    } catch {
      meta = { raw: p.metaJson };
    }
  }

  const doc = await Feedback.create({
    email: p.email ?? null,
    provider: p.provider ?? null,
    userId: p.userId ?? null,

    message: p.message.trim(),

    page: p.page ?? null,
    selectedAssets: p.selectedAssets ?? [],

    yearStart: p.yearStart ?? null,
    yearEnd: p.yearEnd ?? null,
    capPct: p.capPct ?? null,
    rollingWindowMonths: p.rollingWindowMonths ?? null,

    meta,

    userAgent: req.get("user-agent") ?? null,
    ip: (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.ip ?? null
  });

  return res.json({ ok: true, id: doc._id, createdAt: doc.createdAt });
});

router.get("/feedback", async (req, res) => {
  const adminToken = req.get("X-Admin-Token");
  if (!process.env.ADMIN_TOKEN || adminToken !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const limit = Math.min(parseInt((req.query.limit as string) || "50", 10), 200);

  const items = await Feedback.find({})
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return res.json({ items });
});

export default router;
