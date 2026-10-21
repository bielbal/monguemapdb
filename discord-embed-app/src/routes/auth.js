const express = require('express');
const axios = require('axios');
const router = express.Router();

const DISCORD_API = 'https://discord.com/api/v10';
const SCOPES = 'identify guilds';

router.get('/login', (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
  });
  res.redirect(`${DISCORD_API}/oauth2/authorize?${params}`);
});

router.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect('/?error=no_code');

  try {
    const tokenRes = await axios.post(
      `${DISCORD_API}/oauth2/token`,
      new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.REDIRECT_URI,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token, token_type } = tokenRes.data;
    const [userRes, guildsRes] = await Promise.all([
      axios.get(`${DISCORD_API}/users/@me`, { headers: { Authorization: `${token_type} ${access_token}` } }),
      axios.get(`${DISCORD_API}/users/@me/guilds`, { headers: { Authorization: `${token_type} ${access_token}` } }),
    ]);

    req.session.user = {
      ...userRes.data,
      access_token,
      guilds: guildsRes.data.filter(g => (parseInt(g.permissions) & 0x20) === 0x20),
    };

    res.redirect('/dashboard');
  } catch (err) {
    console.error('Auth error:', err.response?.data || err.message);
    res.redirect('/?error=auth_failed');
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

module.exports = router;
