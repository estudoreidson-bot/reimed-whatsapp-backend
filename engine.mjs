// whatsapp/flows/engine.mjs
const SESSIONS = new Map();
export async function sessionGet(id){ return SESSIONS.get(id) || { state:"START", data:{} }; }
export async function sessionSet(id,session){ SESSIONS.set(id, session); }

const ESPECIALIDADES = ["Clínica Médica","Pediatria","Ginecologia","Dermatologia","Cardiologia","Ortopedia","Psiquiatria","Endocrinologia"];
function parseNameCpf(text){ const cpfMatch=(text||"").replace(/\D/g,"").match(/(\d{11})/); const cpf=cpfMatch?cpfMatch[1]:null; const nome=(text||"").replace(/\d/g,"").replace(/[^\p{L}\s]/gu,"").trim(); return { nome, cpf }; }

export async function nextFor({ session, message }){
  let state = session || { state:"START", data:{} };
  const text = message?.text?.body || message?.interactive?.list_reply?.id || "";
  switch(state.state){
    case "START":
      state.state = "WAIT_NAME_CPF";
      return { state, nextState:"WAIT_NAME_CPF", reply:{ type:"text", text:"Olá! Sou da Recepção. Para começar, informe seu Nome completo e CPF." } };
    case "WAIT_NAME_CPF": {
      const { nome, cpf } = parseNameCpf(text||"");
      if(!nome || !cpf) return { state, nextState:"WAIT_NAME_CPF", reply:{ type:"text", text:"Por favor, envie no formato: Nome completo e CPF (somente números)." } };
      state.data.nome = nome; state.data.cpf = cpf;
      const rows = ESPECIALIDADES.slice(0,10).map((s,i)=>({ id:`esp_${i}`, title:s }));
      state.state = "ASK_SPECIALTY"; state.data.especialidades = ESPECIALIDADES;
      return { state, nextState:"ASK_SPECIALTY", reply:{ type:"interactive-list", body:"Qual especialidade deseja?", button:"Escolher", sections:[{ title:"Especialidades", rows }] } };
    }
    case "ASK_SPECIALTY": {
      const idx = String(text||"").startsWith("esp_") ? parseInt(String(text).split("_")[1],10) : -1;
      const esp = state.data.especialidades?.[idx];
      if(!esp) return { state, nextState:"ASK_SPECIALTY", reply:{ type:"text", text:"Seleção inválida. Toque no botão e escolha uma especialidade." } };
      state.data.especialidade = esp; state.state = "MEDIC_QUESTIONS";
      return { state, nextState:"MEDIC_QUESTIONS", reply:{ type:"text", text:`Obrigado, ${state.data.nome}. Agora o Médico vai conduzir algumas perguntas para ${esp}. Qual o motivo principal da consulta?` } };
    }
    case "MEDIC_QUESTIONS": {
      state.data.queixa = message?.text?.body || "(não informado)";
      state.state = "AWAIT_ADMIN";
      return { state, nextState:"AWAIT_ADMIN", reply:{ type:"text", text:"Entendido. Vamos preparar o resumo e encaminhar ao Médico responsável para validar a receita. Você será avisado aqui." } };
    }
    case "AWAIT_ADMIN":
      return { state, nextState:"AWAIT_ADMIN", reply:{ type:"text", text:"Estamos finalizando sua receita. Assim que for validada, enviaremos o PDF aqui no WhatsApp." } };
    default:
      return { state, nextState:"START", reply:{ type:"text", text:"Vamos reiniciar seu atendimento. Informe seu Nome completo e CPF." } };
  }
}
