const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ── Clients ───────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

// ── Helpers ───────────────────────────────────────────────────────────────────
const ksh = (n) => `Ksh ${Number(n).toLocaleString()}`;
const generateOrderId = () =>
  'TWH-' + Date.now().toString(36).toUpperCase() + '-' +
  Math.random().toString(36).substring(2, 5).toUpperCase();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/orders  — Save order + send emails
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/orders', async (req, res) => {
  try {
    const { name, phone, email, items, subtotal, delivery, total, address, notes, mpesaCode } = req.body;

    if (!name || !phone || !items?.length || !mpesaCode) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    const orderId = generateOrderId();

    // 1. Save to Supabase
    const { error: dbError } = await supabase.from('orders').insert({
      order_id: orderId,
      customer_name: name,
      customer_phone: phone,
      customer_email: email || null,
      items,
      subtotal,
      delivery,
      total,
      delivery_address: address,
      notes: notes || null,
      mpesa_code: mpesaCode,
      status: 'pending',
      created_at: new Date().toISOString()
    });

    if (dbError) throw new Error('Database error: ' + dbError.message);

    // 2. Build item rows for emails
    const itemRows = items.map(i => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f0e8d8;">${i.emoji} ${i.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0e8d8;text-align:center;">${i.qty}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0e8d8;text-align:right;">${ksh(i.price * i.qty)}</td>
      </tr>`).join('');

    const tableFooter = `
      <tr><td colspan="2" style="padding:8px 12px;text-align:right;"><strong>Subtotal</strong></td><td style="padding:8px 12px;text-align:right;">${ksh(subtotal)}</td></tr>
      <tr><td colspan="2" style="padding:8px 12px;text-align:right;"><strong>Delivery</strong></td><td style="padding:8px 12px;text-align:right;">${ksh(delivery)}</td></tr>
      <tr style="background:#FFF8EC;">
        <td colspan="2" style="padding:10px 12px;text-align:right;font-size:1.1rem;"><strong>TOTAL</strong></td>
        <td style="padding:10px 12px;text-align:right;font-size:1.1rem;font-weight:bold;color:#B8720A;">${ksh(total)}</td>
      </tr>`;

    const tableHtml = `
      <table style="width:100%;border-collapse:collapse;background:white;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#3D1F00;color:white;">
            <th style="padding:10px 12px;text-align:left;">Item</th>
            <th style="padding:10px 12px;text-align:center;">Qty</th>
            <th style="padding:10px 12px;text-align:right;">Price</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
        <tfoot>${tableFooter}</tfoot>
      </table>`;

    // 3. Notify the business owner
    await resend.emails.send({
      from: process.env.FROM_EMAIL,
      to: process.env.YOUR_EMAIL,
      subject: `🍯 New Order ${orderId} from ${name}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#3D1F00;">
          <div style="background:#E8A020;padding:24px;border-radius:12px 12px 0 0;text-align:center;">
            <h1 style="color:white;margin:0;">🍯 New Order Received!</h1>
          </div>
          <div style="background:#FDF6E3;padding:24px;border-radius:0 0 12px 12px;border:1px solid #f0e8d8;">
            <h2 style="margin-top:0;">Order #${orderId}</h2>
            <h3 style="color:#E8A020;">Customer Details</h3>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Phone:</strong> ${phone}</p>
            ${email ? `<p><strong>Email:</strong> ${email}</p>` : ''}
            <p><strong>Address:</strong> ${address}</p>
            ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}
            <h3 style="color:#E8A020;">Items Ordered</h3>
            ${tableHtml}
            <div style="margin-top:20px;background:#FFF8EC;padding:16px;border-radius:8px;border:1px solid #F5C842;">
              <h3 style="margin:0 0 8px;color:#E8A020;">💳 M-Pesa Confirmation</h3>
              <p style="margin:0;font-size:1.2rem;"><strong>${mpesaCode}</strong></p>
              <p style="margin:8px 0 0;color:#7A4010;font-size:0.9rem;">Verify this in your M-Pesa messages before dispatching.</p>
            </div>
          </div>
        </div>`
    });

    // 4. Confirm to the customer (if email provided)
    if (email) {
      await resend.emails.send({
        from: process.env.FROM_EMAIL,
        to: email,
        subject: `Your Tsavo Wild Honey order is confirmed! 🍯`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#3D1F00;">
            <div style="background:#E8A020;padding:24px;border-radius:12px 12px 0 0;text-align:center;">
              <h1 style="color:white;margin:0;">Thank you, ${name.split(' ')[0]}! 🍯</h1>
              <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;">Your order has been received.</p>
            </div>
            <div style="background:#FDF6E3;padding:24px;border-radius:0 0 12px 12px;border:1px solid #f0e8d8;">
              <p>Hi <strong>${name.split(' ')[0]}</strong>, we've received your order and are verifying your M-Pesa payment. We'll call you on <strong>${phone}</strong> to confirm dispatch.</p>
              <h3 style="color:#E8A020;">Order Summary — #${orderId}</h3>
              ${tableHtml}
              <div style="margin-top:20px;background:#FFF8EC;padding:16px;border-radius:8px;border-left:4px solid #E8A020;">
                <p style="margin:0;"><strong>Delivering to:</strong> ${address}</p>
              </div>
              <p style="margin-top:24px;color:#7A4010;">Questions? Call or WhatsApp us at <strong>${process.env.YOUR_MPESA_NUMBER}</strong>.</p>
              <p style="margin:0;color:#7A4010;font-size:0.85rem;">— The Tsavo Wild Honey Team 🐝</p>
            </div>
          </div>`
      });
    }

    res.json({ success: true, orderId });

  } catch (err) {
    console.error('Order error:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ── GET /api/orders — View all orders ────────────────────────────────────────
app.get('/api/orders', async (req, res) => {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ status: 'ok', service: 'Tsavo Wild Honey API' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🍯 Server running on port ${PORT}`));
