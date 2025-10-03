// server.mjs — Reimed backend (Render)
  // Mantém simples: CORS seguro, healthcheck e endpoint de chat do médico (OpenAI).
  // Início rápido no Render (porta dinâmica).

  import express from "express";
  import cors from "cors";
  import bodyParser from "body-parser";
  import OpenAI from "openai";

// ===== Bloqueio e sanitização de menções a médico/robôs (conforme política do cliente) =====
import crypto from "crypto";

function normalizeText(t) {
  try { return t.normalize('NFD').replace(/\p{Diacritic}/gu,''); } catch { return t; }
}
const médico_PATTERNS = [
  new RegExp("intelig[e\u00ea]ncia\\s*artificial", "i"),
  new RegExp("\\bI\\.?A\\.?\\b|\\bA\\.?I\\.?\\b|\\bmédico\\b|\\bAI\\b", "i"),
  new RegExp("\\bllm\\b|\\bmodelo\\s+de\\s+linguagem\\b|\\bmodelo\\s+generativo\\b", "i"),
  new RegExp("\\brob[o\u00f4]s?|\\brob[o\u00f4]zinho", "i"),
  new RegExp("\\bbot(s)?\\b|\\bchat\\s*-?\\s*bot\\b|\\bchatbot\\b|\\bzapbot\\b", "i"),
  new RegExp("assistente\\s+virtual|atendente\\s+virtual|agente\\s+virtual|agente\\s+conversacional", "i"),
  new RegExp("mensagem\\s+autom[a\u00e1]tica|auto-?resposta|autoatendimento|atendimento\\s+autom[a\u00e1]tico", "i"),
  new RegExp("sistema|algoritmo|m[a\u00e1]quina|computador\\s+respondendo|script|macro|autom[a\u00e1]c[a\u00e3]o", "i"),
  new RegExp("\\bchatgpt\\b|\\bgpt-? ?[45]\\b|\\bgpt\\b", "i"),
  new RegExp("\\bopenai\\b|\\bgemini\\b|\\bbard\\b|\\bclaude\\b|\\bcopilot\\b|\\bperplexity\\b|\\bllama\\b|\\bmistral\\b", "i"),
  new RegExp("\\bmidjourney\\b|\\bdall[\\\\.\\\\-]*e\\b", "i"),
  new RegExp("artificial\\\\s+intelligence|generative\\\\s+ai|conversational\\\\s+ai|virtual\\\\s+assistant|auto-?reply|auto-?response|large\\\\s+language\\\\s+model", "i"),
  new RegExp("inteligencia\\\\s+artificial|mensaje\\\\s+autom[a\u00e1]tico|respuesta\\\\s+autom[a\u00e1]tica|asistente\\\\s+virtual|agente\\\\s+virtual", "i"),
  new RegExp("voc[e\u00ea]\\\\s+[\u00e9e]\\\\s+um\\\\s+rob[o\u00f4]\\\\??|[\u00e9e]\\\\s+ia\\\\??|[\u00e9e]\\\\s+uma\\\\s+ia\\\\??|voc[e\u00ea]\\\\s+[\u00e9e]\\\\s+humano\\\\??|atendimento\\\\s+humano\\\\??|tem\\\\s+um\\\\s+humano\\\\s+a[i\u00ed]\\\\??|fala\\\\s+com\\\\s+humano|quero\\\\s+falar\\\\s+com\\\\s+atendente|transfere\\\\s+para\\\\s+humano|[\u00e9e]\\\\s+o\\\\s+chatgpt\\\\??|[\u00e9e]\\\\s+o\\\\s+gpt\\\\??|[\u00e9e]\\\\s+gravado\\\\??|[\u00e9e]\\\\s+ura\\\\??|algoritmo\\\\s+que\\\\s+responde\\\\??", "i"),
  new RegExp("\\\\bura\\\\b|\\\\bivr\\\\b|\\\\bsecret[a\u00e1]ria\\\\s+eletr[o\u00f4]nica\\\\b|\\\\bmenu\\\\s+eletr[o\u00f4]nico\\\\b", "i"),
  new RegExp("xatgpt|chatgtp|gtp|gptt|intelig[e\u00ea]ncia|artifical|automat(i|\u00ed)ca|atendente|virtuau", "i")
];

function containsForbiddenmédico(text) {
  const n = normalizeText(String(text||''));
  return médico_PATTERNS.some(rx => rx.test(n));
}

function sanitizeOutgoing(text) {
  let n = String(text||'');
  médico_PATTERNS.forEach(rx=>{ n = n.replace(rx, 'médico'); });
  return n;
}


  const app = express();

  // --------- CORS seguro (suporta lista separada por vírgulas) ---------
  const rawOrigins = process.env.ALLOWED_ORIGINS || "";
  const ALLOWED = rawOrigins
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  const corsOptions = {
    origin: function (origin, callback) {
      // Permite chamadas de navegadores (com Origin) apenas das origens listadas
      if (!origin) return callback(null, true); // Postman/Render probes, etc.
      if (ALLOWED.includes(origin)) return callback(null, true);
      return callback(new Error("CORS: origem não permitida: " + origin));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
  };
  app.use(cors(corsOptions));
  app.use(bodyParser.json({ limit: "4mb" }));

  // --------- Healthcheck (acorda o Render free rapidamente) ---------
  app.get("/", (req, res) => res.json({ ok: true, name: "reimed-backend", time: new Date().toISOString() }));
  app.get("/health", (req, res) => {
    res.json({ ok: true, uptime: process.uptime() });
  });

  // --------- OpenAI: endpoint de chat para o médico ---------
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Frase formal para respostas fora de escopo
  const EDU_MSG = "Para agilizar o atendimento médico e mantermos o foco clínico, peço que responda apenas ao que foi perguntado. Obrigado(a).";

  app.post("/api/medico/chat", async (req, res) => {

    // Enriquecimento do prompt com histórico do paciente, se autenticado
    try{
      const h = req.headers["authorization"]||"";
      const t = h.startsWith("Bearer ") ? h.slice(7) : null;
      if(t && patientTokens && patientTokens.get){
        const cpf = patientTokens.get(t);
        if(cpf){
          const all = loadHistory ? loadHistory() : [];
          const hist = (all||[]).filter(hh=>hh.cpf===cpf);
          const resumo = summarizeHistoryForPrompt ? summarizeHistoryForPrompt(hist) : "";
          req.body = req.body || {};
          req.body.patientMeta = Object.assign({}, req.body.patientMeta||{}, { cpf });
          if(resumo){
            req.body.history = (req.body.history||[]);
            req.body.history.unshift({ role:"system", content: "Contexto clínico do paciente (consultas anteriores):\n"+resumo });
          }
        }
      }
    }catch(e){ /* segue sem histórico */ }

    try {
      const { specialty = "Clínico Geral", history = [], patientMeta = {} } = req.body || {};
      const lastUser = (history||[]).slice().reverse().find(m=>m && m.role==="user");
      if(lastUser && containsForbiddenmédico(lastUser.content)){
        return res.json({"ok":true,"reply":"Sou o m\u00e9dico respons\u00e1vel pelo seu atendimento virtual. Todas as orienta\u00e7\u00f5es s\u00e3o avaliadas e a prescri\u00e7\u00e3o final \u00e9 feita com assinatura m\u00e9dica. Vamos focar no seu quadro cl\u00ednico."});
      }

      const system = `Você é o Médico da Queimadas Telemedicina. Seu papel é conduzir a anamnese, formular UMA hipótese diagnóstica principal (a mais provável) e emitir a conduta em formato de receita completa — sempre respeitando que a liberação final será feita exclusivamente por médico humano.

Regras obrigatórias:
1) Antes de prescrever, pergunte e registre idade, peso e alergias. Sem esses dados, não prescreva (faça UMA pergunta por vez e aguarde).
2) Formule apenas a hipótese diagnóstica principal (uma única), claramente justificada pelo que o paciente relatou.
3) Emita CONDUTAS no formato de receita completa (texto plano), com dose por kg quando aplicável, dose máxima por dia, intervalo, duração e modo de uso. Se pediatria, use mg/kg e limite por faixa etária. Se gestante, lactante, idoso ou com comorbidades, ajuste e alerte. Coloque no final: "Assinatura digital: aguardando validação do médico humano".
4) Nunca oriente "procure um médico" como resposta padrão. Em vez disso, se houver sinais de alarme, liste-os e oriente a procurar urgência imediatamente.
5) Solicitação de fotos: só peça foto se houver relato de lesão/trauma/ferida/pele. Para cefaleia recorrente (enxaqueca), primeiro investigue sinais de gravidade e pergunte sobre trauma. Somente se o paciente relatar lesão visível, então peça foto para avaliação da lesão.
6) Em caso de pedido de TROCA DE RECEITA, sempre pergunte: a) por que usa esse medicamento, b) quais sintomas sentia na época, c) como está usando atualmente. Só então gere a nova receita, deixando claro que aguarda validação.
7) Linguagem simples, objetiva e empática. Uma pergunta por vez. Se o paciente fugir do tema, responda: "Vamos por partes. Por favor, responda apenas ao que eu perguntei para seguirmos com segurança."
8) Após concluir a anamnese mínima, entregue em sequência: 
   - Resumo SOAP sucinto.
   - Hipótese diagnóstica principal (apenas uma).
   - Receita médica completa, já formatada, com posologia correta pela idade/peso/alergias informadas. Ao final, escreva: "[STATUS: aguardando receita]" para indicar que o documento aguarda liberação do médico humano.
9) Todas as informações devem seguir práticas atuais de Medicina Baseada em Evidências e PCDT/SUS. Formato de saída esperado:
SOAP (sucinto)
Hipótese diagnóstica principal: <texto curto>
Receita:
<itens da receita com dose, intervalo, duração e modo de uso>
Orientações: <se houver>
Assinatura digital: aguardando validação do médico humano
[STATUS: aguardando receita]`.trim();

      // Coerção simples: garante formato [{role, content}]
      const msgs = [
        { role: "system", content: system },
        ...history.map(m => ({
          role: (m.role === "user" || m.role === "assistant" || m.role === "system") ? m.role : "user",
          content: String(m.content ?? "")
        })),
      ];

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: msgs,
      });

      const reply = completion.choices?.[0]?.message?.content || "Desculpe, não consegui gerar uma resposta agora.";
      res.json({ ok: true, reply });
    } catch (err) {
      console.error("Erro /api/medico/chat:", err?.response?.data || err);
      res.status(500).json({ ok: false, error: "médico indisponível no momento." });
    }
  });

  // --------- Inicialização ---------
  const PORT = process.env.PORT || 10000;
  app.listen(PORT, () => {
    console.log(`API on port ${PORT}`);
    console.log("Your service is live 🎉");
  });

  // --------- Autenticação simples para Médico Administrador ---------
  const tokens = new Set();
  function makeToken(){ return Math.random().toString(36).slice(2)+Date.now().toString(36); }
  app.post("/auth/login", (req,res)=>{
    const { cpf, password } = req.body || {};
    const ADMIN_CPF = process.env.ADMIN_CPF || "00000000000";
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
    if(String(cpf)===String(ADMIN_CPF) && String(password)===String(ADMIN_PASSWORD)){
      const t = makeToken();
      tokens.add(t);
      res.json({ ok:true, token:t, name:"Médico Administrador"});
    } else {
      res.status(401).json({ ok:false, error:"Credenciais inválidas" });
    }
  });
  function auth(req,res,next){
    const h = req.headers["authorization"]||"";
    const t = h.startsWith("Bearer ") ? h.slice(7) : null;
    if(t && tokens.has(t)) return next();
    res.status(401).json({ ok:false, error:"Não autorizado" });
  }

  // --------- Armazenamento temporário de documentos ---------
  const docs = []; // {id, tipo, pacienteNome, pacienteCPF, createdAt, status, conteudo, pdfUrl}
  let seq = 1;

  // Endpoint para registrar documentos gerados
  app.post("/admin/docs", (req,res)=>{
    const { tipo="receita", pacienteNome="", pacienteCPF="", conteudo="" } = req.body||{};
    const id = seq++;
    const item = { id, tipo, pacienteNome, pacienteCPF, conteudo, status:"pendente", createdAt: new Date().toISOString(), pdfUrl:null };
    docs.push(item);
    res.json({ ok:true, id });
  });

  // Resumo por período
  app.get("/admin/summary", auth, (req,res)=>{
    const { start, end } = req.query||{};
    const startDate = start ? new Date(start) : new Date("2000-01-01");
    const endDate = end ? new Date(end+"T23:59:59") : new Date();
    const filtered = docs.filter(d=>{
      const dt = new Date(d.createdAt);
      return dt>=startDate && dt<=endDate;
    });
    const total = filtered.length;
    const pendentes = filtered.filter(d=>d.status==="pendente").length;
    const aprovados = filtered.filter(d=>d.status==="aprovado").length;
    const rejeitados = filtered.filter(d=>d.status==="rejeitado").length;
    res.json({ ok:true, total, pendentes, aprovados, rejeitados });
  });

  // Lista detalhada
  app.get("/admin/docs", auth, (req,res)=>{
    const { start, end, status } = req.query||{};
    const startDate = start ? new Date(start) : new Date("2000-01-01");
    const endDate = end ? new Date(end+"T23:59:59") : new Date();
    let filtered = docs.filter(d=>{
      const dt = new Date(d.createdAt);
      return dt>=startDate && dt<=endDate;
    });
    if(status) filtered = filtered.filter(d=>d.status===status);
    res.json({ ok:true, items: filtered });
  });

  app.post("/admin/docs/:id/approve", auth, (req,res)=>{
    const id = Number(req.params.id);
    const doc = docs.find(d=>d.id===id);
    if(!doc) return res.status(404).json({ ok:false, error:"Não encontrado" });
    if(req.body?.conteudo) doc.conteudo = req.body.conteudo;
    doc.status = "aprovado";
    res.json({ ok:true });
  });

  app.post("/admin/docs/:id/reject", auth, (req,res)=>{
    const id = Number(req.params.id);
    const doc = docs.find(d=>d.id===id);
    if(!doc) return res.status(404).json({ ok:false, error:"Não encontrado" });
    doc.status = "rejeitado";
    res.json({ ok:true });
  });

// ==================== PACIENTE: Autenticação (CPF+senha) e Histórico ====================
// Persistência simples em JSON (adequado ao Replit; em Render é efêmero após deploy)
import fs from "fs";
import path from "path";
const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), "data");
if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const FILE_PATIENTS = path.join(DATA_DIR, "patients.json");
const FILE_HISTORY  = path.join(DATA_DIR, "history.json");

function readJSON(file){ try{ return JSON.parse(fs.readFileSync(file,'utf-8')); } catch{ return []; } }
function writeJSON(file, data){ fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8'); }

function sha256(str){ return crypto.createHash('sha256').update(String(str)).digest('hex'); }

function loadPatients(){ return readJSON(FILE_PATIENTS); }
function savePatients(arr){ writeJSON(FILE_PATIENTS, arr); }
function loadHistory(){ return readJSON(FILE_HISTORY); }
function saveHistory(arr){ writeJSON(FILE_HISTORY, arr); }

// Estruturas: paciente: { cpf, nomeCompleto, passHash, createdAt }
// Consulta: { id, cpf, specialty, messages, assistant, createdAt }

const patientTokens = new Map(); // token -> cpf
function makePatientToken(){ return "pt_" + Math.random().toString(36).slice(2) + Date.now().toString(36); }

app.post("/auth/patient/register", (req,res)=>{
  const { cpf="", nomeCompleto="", password="" } = req.body||{};
  const cleanCPF = String(cpf).replace(/\D+/g,'');
  if(!cleanCPF || !nomeCompleto || !password) return res.status(400).json({ ok:false, error:"Dados obrigatórios: cpf, nomeCompleto, password" });
  const patients = loadPatients();
  if(patients.find(p=>p.cpf===cleanCPF)){
    return res.status(409).json({ ok:false, error:"CPF já cadastrado" });
  }
  const passHash = sha256(password);
  const patient = { cpf: cleanCPF, nomeCompleto: String(nomeCompleto).trim(), passHash, createdAt: new Date().toISOString() };
  patients.push(patient);
  savePatients(patients);
  const token = makePatientToken();
  patientTokens.set(token, cleanCPF);
  res.json({ ok:true, token, patient: { cpf: patient.cpf, nomeCompleto: patient.nomeCompleto } });
});

app.post("/auth/patient/login", (req,res)=>{
  const { cpf="", password="" } = req.body||{};
  const cleanCPF = String(cpf).replace(/\D+/g,'');
  const patients = loadPatients();
  const p = patients.find(x=>x.cpf===cleanCPF);
  if(!p) return res.status(404).json({ ok:false, error:"Paciente não encontrado" });
  if(sha256(password)!==p.passHash) return res.status(401).json({ ok:false, error:"Senha inválida" });
  const token = makePatientToken();
  patientTokens.set(token, cleanCPF);
  res.json({ ok:true, token, patient: { cpf: p.cpf, nomeCompleto: p.nomeCompleto } });
});

function patientAuth(req,res,next){
  const h = req.headers["authorization"]||"";
  const t = h.startsWith("Bearer ") ? h.slice(7) : null;
  if(!t) return res.status(401).json({ ok:false, error:"Sem token" });
  const cpf = patientTokens.get(t);
  if(!cpf) return res.status(401).json({ ok:false, error:"Token inválido" });
  req.patientCPF = cpf;
  next();
}

app.get("/auth/patient/me", patientAuth, (req,res)=>{
  const patients = loadPatients();
  const p = patients.find(x=>x.cpf===req.patientCPF);
  if(!p) return res.status(404).json({ ok:false, error:"Paciente não encontrado" });
  res.json({ ok:true, patient: { cpf: p.cpf, nomeCompleto: p.nomeCompleto } });
});

// Registrar consulta do paciente
app.post("/patient/consultas", patientAuth, (req,res)=>{
  const { specialty="Clínico Geral", messages=[], assistant="" } = req.body||{};
  const history = loadHistory();
  const id = Date.now();
  history.push({ id, cpf: req.patientCPF, specialty, messages, assistant, createdAt: new Date().toISOString() });
  saveHistory(history);
  res.json({ ok:true, id });
});

// Histórico do paciente autenticado
app.get("/patient/history", patientAuth, (req,res)=>{
  const history = loadHistory().filter(h=>h.cpf===req.patientCPF).sort((a,b)=> (a.createdAt<b.createdAt?1:-1));
  res.json({ ok:true, items: history });
});

// Busca por CPF ou nome (Admin)
app.get("/admin/pacientes/search", auth, (req,res)=>{
  const q = String(req.query.q||"").trim().toLowerCase();
  const patients = loadPatients();
  const items = !q ? [] : patients.filter(p=> p.cpf.includes(q.replace(/\D+/g,'')) || p.nomeCompleto.toLowerCase().includes(q));
  res.json({ ok:true, items: items.map(p=>({ cpf:p.cpf, nomeCompleto:p.nomeCompleto })) });
});

// Histórico pelo CPF (Admin)
app.get("/admin/historico", auth, (req,res)=>{
  const cpf = String(req.query.cpf||"").replace(/\D+/g,'');
  if(!cpf) return res.status(400).json({ ok:false, error:"Informe cpf" });
  const history = loadHistory().filter(h=>h.cpf===cpf).sort((a,b)=> (a.createdAt<b.createdAt?1:-1));
  res.json({ ok:true, items: history });
});

// Injeta histórico no prompt do médico quando disponível
// Adiciona resumo breve das últimas 5 consultas do paciente para contexto
function summarizeHistoryForPrompt(all){
  const last = (all||[]).slice(-5);
  return last.map((h,i)=>{
    const resumo = String(h.assistant||"").slice(0,600).replace(/\s+/g,' ').trim();
    return `#${i+1} [${h.createdAt}] ${h.specialty}: ${resumo}`;
  }).join("\\n");
}

// Wrap no /api/medico/chat para buscar histórico quando CPF vier via Authorization do paciente
const originalPost = app._router.stack.find(l=> l.route && l.route.path==="/api/medico/chat" && l.route.methods.post);
if(originalPost){
  // Nada a fazer: endpoint já existe. Vamos interceptar req.body em middleware anterior para enriquecer.
  app.use("/api/medico/chat", (req,res,next)=>{
    try{
      const h = req.headers["authorization"]||"";
      const t = h.startsWith("Bearer ") ? h.slice(7) : null;
      const cpf = t ? patientTokens.get(t) : null;
      if(cpf){
        const hist = loadHistory().filter(hh=>hh.cpf===cpf);
        req.body = req.body || {};
        const resumo = summarizeHistoryForPrompt(hist);
        req.body.patientMeta = Object.assign({}, req.body.patientMeta||{}, { cpf });
        if(resumo){
          req.body.history = (req.body.history||[]);
          req.body.history.unshift({ role:"system", content: "Contexto clínico do paciente (consultas anteriores):\\n"+resumo });
        }
      }
    }catch(e){ /* segue sem histórico se falhar */ }
    next();
  });
}
