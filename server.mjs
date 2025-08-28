// server.mjs — Backend WhatsApp dedicado (Render)
import express from "express";
import cors from "cors";
import whatsappRouter from "./whatsapp/router.mjs";

const app = express();
const ALLOWED = (process.env.ALLOWED_ORIGINS || "").split(",").map(s=>s.trim()).filter(Boolean);
app.use(cors({ origin: (origin, cb) => { if (!origin || ALLOWED.length===0 || ALLOWED.includes(origin)) return cb(null, true); return cb(null, false); } }));

app.get("/", (_req, res) => res.status(200).send("Reimed WhatsApp Backend OK"));
app.use("/whatsapp", whatsappRouter);
app.get("/healthz", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log("WhatsApp backend listening on", PORT); });
