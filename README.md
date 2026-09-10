# ZN30 — Central do Cliente — Backend

Backend em Vercel Functions. Fonte de dados: **Google Sheets** (substitui a
Canva Sheet, que não é acessível pelo backend). O Canva Code continua
sendo o visual — ele só passa a chamar estes endpoints.

## Endpoints

| Método | Rota | Uso |
|---|---|---|
| GET | `/api/health` | Verifica se Mercado Pago e Google Sheets estão configurados |
| GET | `/api/order?code=ZN30-0001` | Cliente, serviço, valor e status do pedido |
| POST | `/api/create-preference` `{code}` | Cria pagamento específico do pedido no Mercado Pago |
| GET | `/api/payment-status?code=ZN30-0001` | Consulta status (com checagem ativa no MP como reforço) |
| POST | `/api/webhook` | Recebido pelo Mercado Pago — único lugar que libera o pedido |
| GET | `/api/download?code=ZN30-0001` | Entrega o arquivo (só se status = LIBERADO) — nunca expõe o link do Drive |

## Passo 1 — Criar a Google Sheet

1. Crie uma planilha no Google Sheets com 3 abas, iguais à estrutura atual:
   - `1 - PEDIDOS` — colunas exatamente nesta ordem:
     `Código | Cliente | E-mail | WhatsApp | Serviço | Valor | Arquivo Drive | Status | Forma de Pagamento | Payment ID`
   - `2 - CLIENTES` (pode ficar como está hoje, não é usada pelo backend)
   - `3 - LOG` — colunas: `Timestamp | Código | Evento | Detalhes`
2. Copie o pedido de teste ZN30-0001 para a aba `1 - PEDIDOS`, coluna
   Status = `PENDENTE`.
3. Na coluna **Arquivo Drive**, cole o ID do arquivo do Google Drive
   (a parte depois de `/d/` na URL) — não precisa ser um link público.

## Passo 2 — Criar a conta de serviço (Google Cloud)

1. Acesse console.cloud.google.com → crie um projeto (ou use um existente).
2. Ative as APIs: **Google Sheets API** e **Google Drive API**.
3. Vá em "Credenciais" → "Criar credenciais" → "Conta de serviço".
4. Após criada, abra a conta de serviço → aba "Chaves" → "Adicionar chave" →
   JSON. Isso baixa um arquivo `.json` — **guarde-o com cuidado, não cole em chat nenhum**.
5. Do JSON, você vai usar dois campos nas variáveis de ambiente:
   - `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → `GOOGLE_PRIVATE_KEY` (cole exatamente como está, com os `\n`)
6. **Compartilhe a planilha** com esse `client_email` (botão Compartilhar, permissão de Editor).
7. **Compartilhe também a pasta/arquivo do Drive** com esse mesmo e-mail
   (permissão de Leitor) — é assim que o backend consegue baixar o arquivo
   sem ele ser público.

## Passo 3 — Configurar variáveis de ambiente na Vercel

No painel do projeto na Vercel → Settings → Environment Variables
(ambiente **Production**), adicione (veja `.env.example`):

```
MERCADOPAGO_ACCESS_TOKEN       (você já tem essa configurada)
GOOGLE_SHEET_ID                 (o ID na URL da planilha, entre /d/ e /edit)
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_PRIVATE_KEY
SITE_URL
BACKEND_URL
ALLOWED_ORIGIN
```

Depois de salvar, faça um **redeploy** (variável nova só entra em vigor após redeploy).

## Passo 4 — Configurar o webhook no Mercado Pago

No painel do Mercado Pago (aplicação "ZN30 — Pagamentos") → Webhooks,
configure a URL:

```
https://SEU-DOMINIO-DA-VERCEL/api/webhook
```

com o evento `payment`. (O código já também recebe a `notification_url`
enviada dinamicamente em cada preference, então isso é redundância saudável.)

## Passo 5 — Testar cada endpoint (nesta ordem)

```bash
# 1. Serviço está de pé e configurado?
curl https://SEU-DOMINIO-DA-VERCEL/api/health

# 2. Pedido de teste é encontrado?
curl "https://SEU-DOMINIO-DA-VERCEL/api/order?code=ZN30-0001"

# 3. Cria um pagamento de teste
curl -X POST https://SEU-DOMINIO-DA-VERCEL/api/create-preference \
  -H "Content-Type: application/json" \
  -d '{"code":"ZN30-0001"}'
# -> copie o "initPoint" retornado e abra no navegador para simular o pagamento
#    (use um usuário de teste do Mercado Pago, não pague de verdade)

# 4. Depois do pagamento aprovado no MP, confira o status
curl "https://SEU-DOMINIO-DA-VERCEL/api/payment-status?code=ZN30-0001"

# 5. Se status = LIBERADO, tente baixar o arquivo
curl -L "https://SEU-DOMINIO-DA-VERCEL/api/download?code=ZN30-0001" -o teste.pdf
```

Depois de cada passo, confira também a aba `3 - LOG` da planilha — cada
evento relevante (preference criada, pagamento aprovado, valor divergente,
download realizado, download negado) fica registrado lá.

## Passo 6 — Conectar o Canva Code a estes endpoints

No Canva Code, troque as chamadas que hoje leem a Canva Sheet diretamente por:

- Tela de consulta → `GET /api/order?code=...`
- Botão PAGAR ONLINE → `POST /api/create-preference` com `{code}` → abrir `initPoint` retornado
- Tela "Analisando pagamento" → poll em `GET /api/payment-status?code=...` até status virar `LIBERADO`
- Botão BAIXAR MEU ARQUIVO → aponta para `GET /api/download?code=...`

O fluxo "JÁ PAGUEI" (upload de comprovante) **não está neste backend ainda**
— ele exige um passo humano de análise (olhar o comprovante) que não dá pra
validar 100% automaticamente. Ficou de fora de propósito, para não passar
a falsa impressão de que valida sozinho. Se você quiser, o próximo passo
natural é: upload vai para uma pasta do Drive, cria uma linha em
"EM ANÁLISE", e você aprova manualmente mudando o Status na planilha —
isso já funciona com o backend atual, sem código novo.

## O que ainda falta em relação ao checklist do briefing

- [ ] Confirmar `MERCADOPAGO_WEBHOOK_SECRET` (assinatura do webhook) — hoje
      o webhook confia na resposta da API do MP (que é chamada com o
      Access Token, então já é segura), mas não valida a assinatura do
      corpo da notificação. Dá para adicionar depois, não é bloqueante.
- [ ] Testar os casos de pagamento pendente/recusado/valor divergente/código
      inexistente listados no checklist de aceite (o código já trata todos,
      mas precisa ser testado com pagamentos de teste reais do Mercado Pago).
- [ ] Decidir o que fazer com o fluxo "JÁ PAGUEI" (ver Passo 6).
