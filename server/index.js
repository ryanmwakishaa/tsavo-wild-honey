const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
require('dotenv').config();

const app = express();
app.set('trust proxy', 1); // Render sits behind a proxy; needed for rate limiting by IP
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || false })); // e.g. https://tsavo-wild-honey.onrender.com
app.use(express.json({ limit: '20kb' }));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

// ── Server-side catalog: prices come from HERE, never from the browser ───────
// Keep in sync with PRODUCTS in public/index.html
const CATALOG = {
  1: { name: 'Wildflower Honey', emoji: '🌸', price: 850 },
  2: { name: 'Tsavo Wild Honey', emoji: '🍯', price: 1200 },
  3: { name: 'Acacia Honey',     emoji: '🌼', price: 1100 },
  4: { name: 'Creamed Honey',    emoji: '🧈', price: 950 },
  5: { name: 'Comb Honey',       emoji: '🐝', price: 1500 },
  6: { name: 'Black Seed Honey', emoji: '🖤', price: 1350 },
};
const DELIVERY_FEE = Number(process.env.DELIVERY_FEE || 150);

// ── Helpers ──────────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ksh = (n) => `Ksh ${Number(n).toLocaleString('en-KE')}`;
const generateOrderId = () =>
  'TWH-' + Date.now().toString(36).toUpperCase() + '-' +
  Math.random().toString(36).substring(2, 5).toUpperCase();
const clean = (v, max) => String(v ?? '').trim().slice(0, max);

function buildOrder(body) {
  const name = clean(body.name, 80);
  const phone = clean(body.phone, 20).replace(/[\s-]/g, '');
  const email = clean(body.email, 120);
  const address = clean(body.address, 300);
  const notes = clean(body.notes, 500);
  const mpesaCode = clean(body.mpesaCode, 12).toUpperCase();

  if (!name || !address) return { error: 'Name and delivery address are required.' };
  if (!/^(\+?254|0)[17]\d{8}$/.test(phone)) return { error: 'Enter a valid Kenyan phone number.' };
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'Enter a valid email.' };
  if (!/^[A-Z0-9]{10}$/.test(mpesaCode)) return { error: 'M-Pesa code should be 10 letters/numbers.' };
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 20)
    return { error: 'Your cart is empty.' };

  const items = [];
  for (const raw of body.items) {
    const p = CATALOG[raw.id];
    const qty = Number(raw.qty);
    if (!p || !Number.isInteger(qty) || qty < 1 || qty > 50) return { error: 'Invalid item in cart.' };
    items.push({ id: raw.id, name: p.name, emoji: p.emoji, price: p.price, qty });
  }
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  return { order: { name, phone, email, address, notes, mpesaCode, items,
                    subtotal, delivery: DELIVERY_FEE, total: subtotal + DELIVERY_FEE } };
}

function tableHtml(o) {
  const rows = o.items.map(i => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f0e8d8;">${i.emoji} ${esc(i.name)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0e8d8;text-align:center;">${i.qty}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0e8d8;text-align:right;">${ksh(i.price * i.qty)}</td>
    </tr>`).join('');
  return `
    <table style="width:100%;border-collapse:collapse;background:white;">
      <thead><tr style="background:#3D1F00;color:white;">
        <th style="padding:10px 12px;text-align:left;">Item</th>
        <th style="padding:10px 12px;text-align:center;">Qty</th>
        <th style="padding:10px 12px;text-align:right;">Price</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><td colspan="2" style="padding:8px 12px;text-align:right;"><strong>Subtotal</strong></td><td style="padding:8px 12px;text-align:right;">${ksh(o.subtotal)}</td></tr>
        <tr><td colspan="2" style="padding:8px 12px;text-align:right;"><strong>Delivery</strong></td><td style="padding:8px 12px;text-align:right;">${ksh(o.delivery)}</td></tr>
        <tr style="background:#FFF8EC;"><td colspan="2" style="padding:10px 12px;text-align:right;"><strong>TOTAL</strong></td><td style="padding:10px 12px;text-align:right;font-weight:bold;color:#B8720A;">${ksh(o.total)}</td></tr>
      </tfoot>
    </table>`;
}

async function sendEmails(orderId, o) {
  const table = tableHtml(o);
  const first = esc(o.name.split(' ')[0]);
  const jobs = [resend.emails.send({
    from: process.env.FROM_EMAIL,
    to: process.env.YOUR_EMAIL,
    subject: `🍯 New Order ${orderId} from ${o.name.replace(/[\r\n]/g, ' ')}`,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#3D1F00;">
      <h2>New order #${orderId}</h2>
      <p><strong>Name:</strong> ${esc(o.name)}<br><strong>Phone:</strong> ${esc(o.phone)}
      ${o.email ? `<br><strong>Email:</strong> ${esc(o.email)}` : ''}
      <br><strong>Address:</strong> ${esc(o.address)}
      ${o.notes ? `<br><strong>Notes:</strong> ${esc(o.notes)}` : ''}</p>
      ${table}
      <p style="background:#FFF8EC;padding:14px;border:1px solid #F5C842;">💳 M-Pesa code: <strong>${esc(o.mpesaCode)}</strong><br>
      Verify in your M-Pesa messages (amount should be ${ksh(o.total)}) before dispatching.</p></div>`
  })];
  if (o.email) jobs.push(resend.emails.send({
    from: process.env.FROM_EMAIL,
    to: o.email,
    subject: 'Your Tsavo Wild Honey order is confirmed! 🍯',
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#3D1F00;">
      <h2>Thank you, ${first}! 🍯</h2>
      <p>We've received your order <strong>#${orderId}</strong> and are verifying your M-Pesa payment.
      We'll call you on <strong>${esc(o.phone)}</strong> to confirm dispatch.</p>
      ${table}
      <p><strong>Delivering to:</strong> ${esc(o.address)}</p>
      <p>Questions? Call or WhatsApp <strong>${esc(process.env.YOUR_MPESA_NUMBER)}</strong>.</p></div>`
  }));
  // allSettled: one failed email must never fail the whole order
  const results = await Promise.allSettled(jobs);
  results.forEach(r => r.status === 'rejected' && console.error('Email error:', r.reason?.message));
}

// ── POST /api/orders ─────────────────────────────────────────────────────────
const orderLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many orders from this connection. Please try again later.' } });

app.post('/api/orders', orderLimiter, async (req, res) => {
  const { order, error } = buildOrder(req.body || {});
  if (error) return res.status(400).json({ error });

  const orderId = generateOrderId();
  const { error: dbError } = await supabase.from('orders').insert({
    order_id: orderId,
    customer_name: order.name,
    customer_phone: order.phone,
    customer_email: order.email || null,
    items: order.items,
    subtotal: order.subtotal,
    delivery: order.delivery,
    total: order.total,
    delivery_address: order.address,
    notes: order.notes || null,
    mpesa_code: order.mpesaCode,
    status: 'pending',
  });

  if (dbError) {
    if (dbError.code === '23505') // unique violation on mpesa_code
      return res.status(409).json({ error: 'That M-Pesa code has already been used for an order.' });
    console.error('DB error:', dbError.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }

  // Order is saved. Respond now; emails happen in the background.
  res.json({ success: true, orderId, total: order.total });
  sendEmails(orderId, order).catch(e => console.error('Email error:', e.message));
});

// ── GET /api/orders: owner only (contains customer phone numbers & addresses) ─
app.get('/api/orders', async (req, res) => {
  const token = (req.get('authorization') || '').replace(/^Bearer /, '');
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN)
    return res.status(401).json({ error: 'Unauthorized' });

  const { data, error } = await supabase.from('orders').select('*')
    .order('created_at', { ascending: false }).limit(200);
  if (error) return res.status(500).json({ error: 'Could not load orders.' });
  res.json(data);
});

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🍯 Server running on port ${PORT}`));

