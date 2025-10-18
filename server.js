import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import bodyParser from 'body-parser';
import 'dotenv/config';

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Armazenamento simples em memória (substitua por banco em produção)
const payments = new Map(); // refId -> { paid: boolean, amount, createdAt }

// Criar checkout (preference) no Mercado Pago — R$ 9,90
app.post('/api/criar-checkout', async (req, res) => {
  try {
    const { reference_id, amount } = req.body; // amount em centavos (990)
      return res.status(400).json({ error: 'reference_id e amount são obrigatórios.' });
    }

    payments.set(reference_id, { paid: false, amount, createdAt: Date.now() });

    const prefRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
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
      })
    });

    if (!prefRes.ok) {
      const text = await prefRes.text();
      console.error('Erro ao criar preference:', text);
      return res.status(500).json({ error: 'Falha ao criar checkout.' });
    }

    const pref = await prefRes.json();
    // init_point (produção/sandbox) — URL do checkout
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

// Webhook do Mercado Pago — confirma o pagamento e libera a referência
app.post('/webhook/pagamento-confirmado', async (req, res) => {
  try {
    // O MP pode enviar em body e/ou query (?type=payment&id=...)

    // Verifica se é evento de pagamento e consulta o pagamento na API oficial
    if (eventType === 'payment' && eventId) {
      const payRes = await fetch(`https://api.mercadopago.com/v1/payments/${eventId}`, {
        headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` }
      });
      const payment = await payRes.json();

      if (payment && payment.status === 'approved') {
        const ref = payment.external_reference;
        if (ref && payments.has(ref)) {
          const p = payments.get(ref);
          payments.set(ref, { ...p, paid: true });
          console.log('Pagamento aprovado — referência liberada:', ref);
        } else {
          console.log('Ref não encontrada no mapa local:', ref);
        }
      } else {
        console.log('Evento não aprovado ou pagamento inválido:', payment?.status);
      }
    } else {
      // Alguns webhooks podem não trazer type/id — apenas log
    }

    // Importante: Responder 200 para evitar reentregas excessivas
    res.status(200).send('ok');
  } catch (e) {
    console.error('Erro no webhook:', e);
    res.status(200).send('ok');
  }
});

// Consultar status da referência (front usa para liberar paywall)
app.get('/api/status-pagamento', (req, res) => {
  const ref = req.query.ref;
  const info = payments.get(ref);
  return res.json({ paid: !!info?.paid });
});

app.listen(PORT, () => console.log('API Dr. FIES rodando na porta', PORT));
