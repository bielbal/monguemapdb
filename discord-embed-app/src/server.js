require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const { Client, GatewayIntentBits, Events } = require('discord.js');

const authRouter = require('./routes/auth');
const apiRouter = require('./routes/api');

// ── Discord Bot ──────────────────────────────────────────────────────────────
const bot = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

bot.once(Events.ClientReady, () => {
  console.log(`✅ Bot online: ${bot.user.tag}`);
});

bot.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;

  const { customId, user, message } = interaction;

  // Default handler — shows an ephemeral ack with the button ID
  // Customize below per custom_id
  if (customId.startsWith('confirm_')) {
    await interaction.reply({
      content: `✅ **Confirmado!** Ação \`${customId}\` executada por ${user.username}.`,
      ephemeral: true,
    });
  } else if (customId.startsWith('cancel_')) {
    await interaction.reply({
      content: `❌ **Cancelado.** Ação cancelada por ${user.username}.`,
      ephemeral: true,
    });
  } else if (customId.startsWith('info_')) {
    await interaction.reply({
      content: `ℹ️ Botão \`${customId}\` pressionado por ${user.username}.`,
      ephemeral: true,
    });
  } else {
    await interaction.reply({
      content: `🔘 Botão \`${customId}\` recebido! Usuário: ${user.username}`,
      ephemeral: true,
    });
  }
});

bot.login(process.env.DISCORD_BOT_TOKEN).catch(err => {
  console.error('❌ Bot login failed:', err.message);
});

// ── Express App ──────────────────────────────────────────────────────────────
const app = express();

app.locals.bot = bot;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'change_me_in_production',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 86400000 },
}));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/auth', authRouter);
app.use('/api', apiRouter);

// SPA fallback for dashboard
app.get('/dashboard', (req, res) => {
  if (!req.session.user) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server: http://localhost:${PORT}`));
