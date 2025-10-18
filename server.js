import express from 'express';
import cors from 'cors';
import 'dotenv/config';

const app = express();
app.use(cors());
app.use(express.json());

// KV simples em memória (trocar por DB em produção)
const payments = new Map(); // refId -> { paid: boolean, amount, createdAt }

// Health-check
app.get('/', (req, res) => {
  res.send('API Dr. FIES ativa');
});

// Criar checkout (preference) no Mercado Pago — R$ 9,90
app.post('/api/criar-checkout', async (req, res) => {
  try {
    const { reference_id, amount } = req.body; // amount em centavos (990)
      return res.status(400).json({ error: 'reference_id e amount são obrigatórios.' });
    }
    if (!process.env.MP_ACCESS_TOKEN) {
      return res.status(500).json({ error: 'MP_ACCESS_TOKEN não configurado.' });
    }
    if (!process.env.PUBLIC_URL) {
      return res.status(500).json({ error: 'PUBLIC_URL não configurado.' });
    }

    payments.set(reference_id, { paid: false, amount, createdAt: Date.now() });

    const prefBody = {
      items: [
        {
          title: 'Cálculo FIES + Relatório',
          quantity: 1,
          currency_id: 'BRL',
          unit_price: amount / 100 // 990 -> 9.90
        }
      ],
      external_reference: reference_id,
      back_urls: {
        success: `${process.env.PUBLIC_URL}/retorno?status=success&ref=${reference_id}`,
        failure: `${process.env.PUBLIC_URL}/retorno?status=failure&ref=${reference_id}`,
        pending: `${process.env.PUBLIC_URL}/retorno?status=pending&ref=${reference_id}`
      },
      auto_return: 'approved',
      notification_url: `${process.env.PUBLIC_URL}/webhook/pagamento-confirmado`
    };

    const prefRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(prefBody)
    });

    if (!prefRes.ok) {
      const text = await prefRes.text();
      console.error('Erro preference:', text);
      return res.status(500).json({ error: 'Falha ao criar checkout.' });
    }

    const pref = await prefRes.json();
    return res.json({ checkoutUrl });
  } catch (e) {
    console.error('Erro /api/criar-checkout:', e);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

// Webhook do Mercado Pago — confirma o pagamento e libera a referência
app.post('/webhook/pagamento-confirmado', async (req, res) => {
  try {

    if (eventType === 'payment' && eventId) {
      const payRes = await fetch(`https://api.mercadopago.com/v1/payments/${eventId}`, {
        headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` }
      });
      if (!payRes.ok) {
        const t = await payRes.text();
        console.error('Falha ao consultar pagamento:', t);
      } else {
        const payment = await payRes.json();
        if (payment?.status === 'approved') {
          const ref = payment.external_reference;
          if (ref && payments.has(ref)) {
            const p = payments.get(ref);
            payments.set(ref, { ...p, paid: true });
            console.log('Pagamento aprovado — ref liberada:', ref);
          } else {
            console.log('Ref não encontrada no mapa local:', ref);
          }
        } else {
          console.log('Pagamento não aprovado:', payment?.status);
        }
      }
    } else {
    }

    // Sempre 200 para evitar reentregas excessivas
    res.status(200).send('ok');
  } catch (e) {
    console.error('Erro webhook:', e);
    res.status(200).send('ok');
  }
});

// Status para liberar paywall
app.get('/api/status-pagamento', (req, res) => {
  const ref = req.query.ref;
  const info = payments.get(ref);
  return res.json({ paid: !!info?.paid });
});

app.listen(PORT, () => {
  console.log('API Dr. FIES rodando na porta', PORT);
});
