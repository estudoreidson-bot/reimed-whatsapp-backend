// whatsapp/router.mjs
import express from "express";
import { handleIncoming, adminApprove } from "./services/handlers.mjs";

const router = express.Router();

router.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) return res.status(200).send(challenge);
  return res.sendStatus(403);
});

router.post("/webhook", express.json({ limit: "2mb" }), async (req, res) => {
  try { await handleIncoming(req.body); res.sendStatus(200); } catch { res.sendStatus(200); }
});

router.post("/admin/approve", express.json(), async (req, res) => {
  try {
    const { to, pdfUrl, message } = req.body || {};
    if (!to || !pdfUrl) return res.status(400).json({ ok: false, error: "to e pdfUrl são obrigatórios" });
    await adminApprove({ to, pdfUrl, message });
    res.json({ ok: true });
  } catch { res.status(500).json({ ok: false }); }
});

export default router;
