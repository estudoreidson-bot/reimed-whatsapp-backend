// whatsapp/services/whatsapp.mjs
import fetch from "node-fetch";
const GRAPH_BASE = process.env.WHATSAPP_GRAPH_BASE || "https://graph.facebook.com";
const GRAPH_VER = process.env.WHATSAPP_GRAPH_VERSION || "v20.0";
const PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID;
const WA_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
function endpoint(path) { return `${GRAPH_BASE}/${GRAPH_VER}/${PHONE_NUMBER_ID}${path}`; }
async function post(path, body) {
  const res = await fetch(endpoint(path), { method:"POST", headers:{ "Authorization":`Bearer ${WA_TOKEN}`, "Content-Type":"application/json" }, body: JSON.stringify(body) });
  if (!res.ok) { const text = await res.text().catch(()=>"?"); console.warn("WA post fail", res.status, text.slice(0,200)); }
  return res;
}
export async function markRead(messageId){ return post("/messages",{ messaging_product:"whatsapp", status:"read", message_id: messageId }); }
export async function typingOnOff(to,on=true){ return post("/messages",{ messaging_product:"whatsapp", to, type:"typing", typing:{ status: on?"on":"off" } }); }
export async function sendText(to,text){ return post("/messages",{ messaging_product:"whatsapp", to, type:"text", text:{ body:text } }); }
export async function sendInteractiveList(to,bodyText,sections,button="Escolher"){ return post("/messages",{ messaging_product:"whatsapp", to, type:"interactive", interactive:{ type:"list", body:{ text: bodyText }, action:{ button, sections } } }); }
export async function sendDocument(to,link,filename="arquivo.pdf",caption=""){ return post("/messages",{ messaging_product:"whatsapp", to, type:"document", document:{ link, filename, caption } }); }
