// server.js - Backend Node.js pour verification Stripe
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(cors());
app.use(express.json());

// Stockage en memoire des paiements verifies (en prod: utiliser une vraie DB)
const verifiedPayments = new Map();

// ============================================
// VERIFICATION SERVEUR - OBLIGATOIRE
// ============================================
app.post('/api/verify-payment', async (req, res) => {
  try {
    const { sessionId, userId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ 
        success: false, 
        error: 'session_id manquant' 
      });
    }

    // VERIFICATION REELLE AVEC L'API STRIPE
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Check: le paiement est-il vraiment complete ?
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ 
        success: false, 
        error: 'Paiement non confirme par Stripe',
        status: session.payment_status
      });
    }

    // Check: le montant correspond-il ?
    if (session.amount_total !== 399) { // 3.99 EUR en centimes
      return res.status(400).json({ 
        success: false, 
        error: 'Montant incorrect' 
      });
    }

    // Check: deja utilise ?
    if (verifiedPayments.has(sessionId)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Session deja utilisee' 
      });
    }

    // Tout est OK - marquer comme verifie
    verifiedPayments.set(sessionId, {
      userId: userId,
      verifiedAt: new Date().toISOString(),
      customerEmail: session.customer_details?.email || null
    });

    res.json({ 
      success: true,
      message: 'Paiement verifie par Stripe',
      customerEmail: session.customer_details?.email || null
    });

  } catch (err) {
    console.error('Erreur verification Stripe:', err.message);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur serveur lors de la verification' 
    });
  }
});

// Check si un user a deja un premium actif
app.post('/api/check-premium', async (req, res) => {
  try {
    const { userId } = req.body;
    // En prod: verifier dans une vraie base de donnees
    // Ici on simule - le client gere ca via localStorage mais avec un token signe
    res.json({ premium: false });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Serveur Beubeuland demarre sur le port ' + PORT);
});
