const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(cors());

// ========== WEBHOOK (DOIT ÊTRE AVANT express.json()) ==========
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    verifiedPayments.set(session.id, {
      userId: session.client_reference_id || 'unknown',
      status: 'paid',
      amount: session.amount_total,
      customerEmail: session.customer_details?.email,
      verifiedAt: new Date().toISOString()
    });
    savePayments();

    console.log('Payment verified via webhook:', session.id);
  }

  res.json({ received: true });
});

// ========== MIDDLEWARE JSON (APRÈS le webhook) ==========
app.use(express.json());

// ========== PERSISTENCE FICHIER ==========
const DATA_FILE = path.join(__dirname, 'payments.json');

let verifiedPayments = new Map();
try {
  if (fs.existsSync(DATA_FILE)) {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    verifiedPayments = new Map(Object.entries(data));
    console.log(`Loaded ${verifiedPayments.size} verified payments from disk`);
  }
} catch (e) {
  console.error('Error loading payments:', e);
}

function savePayments() {
  try {
    const obj = Object.fromEntries(verifiedPayments);
    fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.error('Error saving payments:', e);
  }
}

// ========== VERIFY PAYMENT ==========
app.post('/api/verify-payment', async (req, res) => {
  try {
    const { sessionId, userId } = req.body;

    if (!sessionId || !userId) {
      return res.status(400).json({ success: false, error: 'Missing sessionId or userId' });
    }

    if (verifiedPayments.has(sessionId)) {
      const data = verifiedPayments.get(sessionId);
      if (data.userId === userId && data.status === 'paid') {
        return res.json({ success: true, status: 'already_verified' });
      }
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === 'paid') {
      verifiedPayments.set(sessionId, {
        userId: userId,
        status: 'paid',
        amount: session.amount_total,
        verifiedAt: new Date().toISOString()
      });
      savePayments();

      return res.json({ 
        success: true, 
        status: 'paid',
        amount: session.amount_total 
      });
    } else {
      return res.json({ 
        success: false, 
        status: session.payment_status,
        error: 'Payment not confirmed' 
      });
    }
  } catch (err) {
    console.error('Stripe verification error:', err);
    return res.status(500).json({ 
      success: false, 
      error: 'Server verification failed' 
    });
  }
});

// ========== CHECK PREMIUM STATUS ==========
app.post('/api/check-premium', async (req, res) => {
  try {
    const { sessionId, userId } = req.body;

    if (!sessionId || !userId) {
      return res.status(400).json({ success: false, error: 'Missing parameters' });
    }

    const payment = verifiedPayments.get(sessionId);
    if (payment && payment.userId === userId && payment.status === 'paid') {
      return res.json({ success: true, premium: true });
    }

    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status === 'paid') {
        verifiedPayments.set(sessionId, {
          userId: userId,
          status: 'paid',
          verifiedAt: new Date().toISOString()
        });
        savePayments();
        return res.json({ success: true, premium: true });
      }
    } catch (e) {
      // Stripe check failed
    }

    return res.json({ success: true, premium: false });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ========== HEALTH CHECK (pour UptimeRobot) ==========
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    paymentsCount: verifiedPayments.size 
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Beubeuland API running on port', PORT);
});
