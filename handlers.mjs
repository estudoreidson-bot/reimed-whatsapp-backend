// whatsapp/services/handlers.mjs
import { sendText, sendInteractiveList, sendDocument, markRead, typingOnOff } from "./whatsapp.mjs";
import { nextFor, sessionGet, sessionSet } from "../flows/engine.mjs";

export async function handleIncoming(payload) {
  const value = payload?.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];
  const from = message?.from;
  const wamid = message?.id;
  if (!from || !wamid) return;
  await markRead(wamid);
  try { await typingOnOff(from, true); } catch {}
  const session = await sessionGet(from);
  const { reply, state, nextState } = await nextFor({ session, message });
  if (reply?.type === "interactive-list") await sendInteractiveList(from, reply.body, reply.sections, reply.button || "Escolher");
  else if (reply?.type === "document") await sendDocument(from, reply.url, reply.filename || "arquivo.pdf", reply.caption || "");
  else await sendText(from, reply?.text || "Olá! Para começar, informe seu Nome completo e CPF.");
  await sessionSet(from, { state: nextState, data: state?.data });
  try { await typingOnOff(from, false); } catch {}
}

export async function adminApprove({ to, pdfUrl, message }) {
  const texto = message || "Sua receita validada está disponível. Segue o PDF.";
  await sendText(to, texto);
  await sendDocument(to, pdfUrl, "Receita_Assinada.pdf", "Receita assinada");
}
