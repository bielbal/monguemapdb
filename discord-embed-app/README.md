# Discord Embed Builder Dashboard

Dashboard completo para criar e enviar embeds no Discord com botões interativos. Login via OAuth2 do Discord.

## Stack

- **Backend**: Node.js + Express.js
- **Bot**: Discord.js v14
- **Frontend**: HTML + CSS puro (sem framework)
- **Auth**: Discord OAuth2

## Features

- 🔐 Login com Discord OAuth2
- 🎨 Editor visual com preview em tempo real
- 📋 Campos inline/block
- 🔘 Botões: Primary, Secondary, Success, Danger, Link
- ⚡ Envio direto para qualquer canal
- 📝 4 templates prontos (Boas-vindas, Anúncio, Sorteio, Ticket)
- 📜 Histórico de embeds enviados
- 🌙 Dark mode nativo

## Setup

### 1. Clone e instale

```bash
cd discord-embed-app
npm install
```

### 2. Configure as variáveis de ambiente

```bash
cp .env.example .env
```

Preencha o `.env`:

```env
DISCORD_CLIENT_ID=     # ID do app em discord.com/developers
DISCORD_CLIENT_SECRET= # Secret do app
DISCORD_BOT_TOKEN=     # Token do bot
SESSION_SECRET=        # String aleatória longa
REDIRECT_URI=http://localhost:3000/auth/callback
PORT=3000
```

### 3. Configure o app Discord

Em [discord.com/developers](https://discord.com/developers/applications):

1. **OAuth2 → Redirects**: adicione `http://localhost:3000/auth/callback`
2. **Bot**: ative **Server Members Intent** e **Message Content Intent**
3. Convide o bot com permissões: `Send Messages`, `Embed Links`, `Read Message History`

URL de convite do bot:
```
https://discord.com/api/oauth2/authorize?client_id=SEU_CLIENT_ID&permissions=2147485696&scope=bot%20applications.commands
```

### 4. Inicie

```bash
npm start
# ou para desenvolvimento:
npm run dev
```

Acesse: `http://localhost:3000`

## Deploy

Para deploy em produção (ex: Railway, Render, VPS):

1. Configure as variáveis de ambiente no servidor
2. Mude `REDIRECT_URI` para a URL pública
3. Adicione a nova URL no Discord Developer Portal

## Estrutura

```
src/
├── server.js          # Express + Discord bot
├── routes/
│   ├── auth.js        # OAuth2 Discord
│   └── api.js         # API REST
└── public/
    ├── index.html     # Landing page
    ├── dashboard.html # Editor de embeds
    └── css/style.css  # Estilos
```

## Interações de Botões

O bot responde automaticamente aos botões. Customize em `src/server.js` no handler `InteractionCreate`:

```js
bot.on(Events.InteractionCreate, async interaction => {
  if (interaction.customId === 'meu_botao') {
    await interaction.reply({ content: 'Minha resposta!', ephemeral: true });
  }
});
```
