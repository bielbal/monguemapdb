const express = require('express');
const router = express.Router();

const requireAuth = (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  next();
};

// GET /api/me
router.get('/me', requireAuth, (req, res) => {
  const { id, username, discriminator, avatar, guilds } = req.session.user;
  res.json({ id, username, discriminator, avatar, guilds });
});

// GET /api/guilds/:guildId/channels
router.get('/guilds/:guildId/channels', requireAuth, async (req, res) => {
  const { bot } = req.app.locals;
  const guild = bot.guilds.cache.get(req.params.guildId);
  if (!guild) return res.status(404).json({ error: 'Bot not in this server. Invite the bot first.' });

  const channels = guild.channels.cache
    .filter(c => c.type === 0) // GUILD_TEXT
    .map(c => ({ id: c.id, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  res.json(channels);
});

// POST /api/send-embed
router.post('/send-embed', requireAuth, async (req, res) => {
  const { bot } = req.app.locals;
  const { channelId, embed, components } = req.body;

  if (!channelId || !embed) return res.status(400).json({ error: 'channelId and embed are required' });

  try {
    const channel = await bot.channels.fetch(channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    const payload = { embeds: [buildEmbed(embed)] };

    if (components && components.length > 0) {
      payload.components = buildComponents(components);
    }

    const msg = await channel.send(payload);
    res.json({ success: true, messageId: msg.id, channelId });
  } catch (err) {
    console.error('Send embed error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

function buildEmbed(data) {
  const embed = {};
  if (data.title) embed.title = data.title;
  if (data.description) embed.description = data.description;
  if (data.color) embed.color = parseInt(data.color.replace('#', ''), 16);
  if (data.url) embed.url = data.url;
  if (data.timestamp) embed.timestamp = new Date().toISOString();

  if (data.author?.name) {
    embed.author = { name: data.author.name };
    if (data.author.icon_url) embed.author.icon_url = data.author.icon_url;
    if (data.author.url) embed.author.url = data.author.url;
  }

  if (data.thumbnail) embed.thumbnail = { url: data.thumbnail };
  if (data.image) embed.image = { url: data.image };

  if (data.footer?.text) {
    embed.footer = { text: data.footer.text };
    if (data.footer.icon_url) embed.footer.icon_url = data.footer.icon_url;
  }

  if (data.fields && data.fields.length > 0) {
    embed.fields = data.fields
      .filter(f => f.name && f.value)
      .map(f => ({ name: f.name, value: f.value, inline: !!f.inline }));
  }

  return embed;
}

function buildComponents(rows) {
  return rows.map(row => ({
    type: 1,
    components: row.buttons.map(btn => {
      const comp = {
        type: 2,
        label: btn.label,
        style: btn.style || 1,
      };
      if (btn.style === 5) {
        comp.url = btn.url || 'https://example.com';
      } else {
        comp.custom_id = btn.custom_id || `btn_${Date.now()}`;
      }
      if (btn.emoji) comp.emoji = { name: btn.emoji };
      if (btn.disabled) comp.disabled = true;
      return comp;
    }),
  }));
}

module.exports = router;
