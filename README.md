[README.md](https://github.com/user-attachments/files/21774459/README.md)
[README.md](https://github.com/user-attachments/files/21762667/README.md)
# Queimadas Telemedicina — entrega v4

## Frontend (Netlify / GitHub `reimed-frontend`)
Arquivos:
- `index.html` (redireciona direto para `receptionist.html`)
- `receptionist.html` (fluxo com lista completa de especialidades → contagem 1–5 min → ponte)
- `paciente.html` (ponte que cria sessão no backend e envia para `medico.html` — bloqueia acesso direto)
- `medico.html` (chat do médico com IA real via Render; pensar/digitar humanos; envio de arquivos)
- `style.css`
- `especialidades.json` (lista clicável)

Imagens esperadas (já existem no seu repositório): `prefeitura-queimadas.jpg`, `atende-mais.png`.

## Backend (Render / GitHub `reimed-backend`)
- `server.mjs` (Express + OpenAI)
- `especialidades_roteiros.json`
- `package.json`

### Variáveis de ambiente no Render
- `OPENAI_API_KEY` = sua chave sk-… (já adicionada)
- `ALLOWED_ORIGINS` = subtle-lolly-939001.netlify.app, https://subtle-lolly-939001.netlify.app
- `PORT` = 10000 (Render define automaticamente)
- Outras (opcionais): `JWT_SECRET`, etc.

