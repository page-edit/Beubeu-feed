const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

const subscriptions = new Map();
const usedSessions = new Set();

app.post('/api/verify-payment', async (req, res) => {
  const { sessionId, userId } = req.body;
  if (!sessionId || !userId) return res.status(400).json({ error: 'sessionId et userId requis' });
  if (usedSessions.has(sessionId)) return res.status(400).json({ error: 'Session déjà utilisée' });
  
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== 'paid') return res.status(400).json({ error: 'Paiement non confirmé' });
  if (session.amount_total !== 399) return res.status(400).json({ error: 'Montant incorrect' });
  
  usedSessions.add(sessionId);
  const activationToken = crypto.randomBytes(32).toString('hex');
  subscriptions.set(userId, { sessionId, status: 'active', activatedAt: new Date().toISOString(), activationToken });
  
  res.json({ success: true, activationToken });
});

app.get('/api/check-premium/:userId', (req, res) => {
  const sub = subscriptions.get(req.params.userId);
  res.json({ premium: !!(sub && sub.status === 'active'), activatedAt: sub?.activatedAt });
});

app.post('/api/activate-premium', async (req, res) => {
  const { userId, activationToken } = req.body;
  const sub = subscriptions.get(userId);
  if (!sub || sub.activationToken !== activationToken) return res.status(403).json({ error: 'Token invalide' });
  sub.activationToken = null;
  res.json({ success: true, activatedAt: sub.activatedAt });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur sur le port ${PORT}`));
