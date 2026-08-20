import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import mysql from 'mysql2/promise';

const execFileAsync = promisify(execFile);
const root = process.cwd();
mkdirSync(path.join(root, 'data'), { recursive: true });
mkdirSync(path.join(root, 'uploads'), { recursive: true });

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER && process.env.DB_USER !== 'root' ? process.env.DB_USER : 'exopfnhh_nfcinvoice',
  password: process.env.DB_PASS || 'Official@12345',
  database: process.env.DB_NAME && process.env.DB_NAME !== 'invoice_crm' && process.env.DB_NAME !== 'nfcinvoice' ? process.env.DB_NAME : 'exopfnhh_nfcinvoice',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  multipleStatements: true,
  dateStrings: true
});

const rows = async (sql, ...params) => {
  const [res] = await pool.execute(sql, params.map(x => x === undefined ? null : x));
  return res;
};

const one = async (sql, ...params) => {
  const res = await rows(sql, ...params);
  return res[0] || null;
};

const run = async (sql, ...params) => {
  const [res] = await pool.execute(sql, params.map(x => x === undefined ? null : x));
  return { lastInsertRowid: res.insertId, changes: res.affectedRows };
};

const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
const body = async req => { const chunks = []; for await (const c of req) chunks.push(c); try { return JSON.parse(Buffer.concat(chunks).toString() || '{}') } catch { return null } };
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(x => x.trim().split('=').map(decodeURIComponent)));
const hash = password => { const salt = crypto.randomBytes(16).toString('hex'); return salt + ':' + crypto.scryptSync(password, salt, 64).toString('hex') };
const validPassword = (password, saved) => { const [salt, key] = saved.split(':'); return crypto.timingSafeEqual(Buffer.from(key, 'hex'), crypto.scryptSync(password, salt, 64)) };

const auth = async req => {
  const token = cookies(req).session;
  if (!token) return null;
  return one('SELECT u.id, u.name, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?', token, Date.now());
};

const clean = (obj, allowed) => Object.fromEntries(allowed.map(k => [k, obj?.[k] ?? null]));
const settingsMap = async () => Object.fromEntries((await rows('SELECT * FROM settings')).map(x => [x.key, x.value]));
const invoiceLinkToken = async id => crypto.createHmac('sha256', (await settingsMap()).public_link_secret || (await settingsMap()).meta_token || 'billflow-public-link').update(String(id)).digest('hex').slice(0, 24);
const estimateLinkToken = async id => crypto.createHmac('sha256', (await settingsMap()).public_link_secret || (await settingsMap()).meta_token || 'billflow-public-link').update(`estimate:${id}`).digest('hex').slice(0, 24);

async function sendInvoicePdf(res, id) {
  const invoice = await one('SELECT i.*, c.name customer_name, c.business_name customer_business, c.email customer_email, c.phone customer_phone, c.gstin customer_gstin, c.address customer_address, co.name company_name, co.gstin company_gstin, co.address company_address, co.email company_email, co.phone company_phone, co.bank_details, co.logo FROM invoices i JOIN customers c ON c.id=i.customer_id JOIN companies co ON co.id=i.company_id WHERE i.id=?', id);
  if (!invoice) return json(res, 404, { error: 'Invoice not found' });
  invoice.lines = await rows('SELECT * FROM invoice_lines WHERE invoice_id=?', id);
  const token = crypto.randomBytes(8).toString('hex'), input = path.join(os.tmpdir(), `invoice-${token}.json`), output = path.join(os.tmpdir(), `invoice-${token}.pdf`);
  try {
    await writeFile(input, JSON.stringify(invoice));
    const bundled = 'C:\\Users\\NITRO\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe', python = process.env.PYTHON_EXECUTABLE || (process.platform === 'win32' && existsSync(bundled) ? bundled : 'python3');
    await execFileAsync(python, [path.join(root, 'scripts', 'generate_invoice.py'), input, output], { timeout: 30000 });
    const bytes = await readFile(output);
    const filename = `${invoice.customer_business || invoice.customer_name || 'Invoice'} ${invoice.invoice_date}.pdf`.replace(/[\\/:*?"<>|]/g, '-');
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename.replace(/[^\x20-\x7E]/g, '')}"`, 'Content-Length': bytes.length, 'Cache-Control': 'private, no-store' });
    return res.end(bytes);
  } catch (err) {
    console.error('PDF generation error:', err.message);
    return json(res, 500, { error: err.message || 'PDF generation failed on server' });
  } finally {
    for (const f of [input, output]) if (existsSync(f)) await import('node:fs/promises').then(m => m.unlink(f).catch(() => { }));
  }
}

async function sendEstimatePdf(res, id) {
  const estimate = await one('SELECT e.*, c.name customer_name, c.business_name customer_business, c.email customer_email, c.phone customer_phone, c.gstin customer_gstin, c.address customer_address, co.name company_name, co.gstin company_gstin, co.address company_address, co.email company_email, co.phone company_phone, co.bank_details, co.logo FROM estimates e JOIN customers c ON c.id=e.customer_id JOIN companies co ON co.id=e.company_id WHERE e.id=?', id);
  if (!estimate) return json(res, 404, { error: 'Estimate not found' });
  estimate.lines = await rows('SELECT * FROM estimate_lines WHERE estimate_id=?', id);
  estimate.document_type = 'ESTIMATE';
  const token = crypto.randomBytes(8).toString('hex'), input = path.join(os.tmpdir(), `estimate-${token}.json`), output = path.join(os.tmpdir(), `estimate-${token}.pdf`);
  try {
    await writeFile(input, JSON.stringify(estimate));
    const bundled = 'C:\\Users\\NITRO\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe', python = process.env.PYTHON_EXECUTABLE || (process.platform === 'win32' && existsSync(bundled) ? bundled : 'python3');
    await execFileAsync(python, [path.join(root, 'scripts', 'generate_invoice.py'), input, output], { timeout: 30000 });
    const bytes = await readFile(output), filename = `Estimate ${estimate.customer_business || estimate.customer_name} ${estimate.estimate_date}.pdf`.replace(/[\\/:*?"<>|]/g, '-');
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename.replace(/[^\x20-\x7E]/g, '')}"`, 'Content-Length': bytes.length, 'Cache-Control': 'private, no-store' });
    return res.end(bytes);
  } catch (err) {
    console.error('Estimate PDF generation error:', err.message);
    return json(res, 500, { error: err.message || 'PDF generation failed on server' });
  } finally {
    for (const f of [input, output]) if (existsSync(f)) await import('node:fs/promises').then(m => m.unlink(f).catch(() => { }));
  }
}

async function whatsappText(phone, message) {
  const s = await settingsMap();
  if (!s.meta_token || !s.meta_phone_id) return { sent: false, warning: 'Meta WhatsApp credentials are not configured' };
  if (!phone) return { sent: false, warning: 'Customer phone is missing' };
  const version = s.meta_api_version || 'v22.0';
  const response = await fetch(`https://graph.facebook.com/${version}/${s.meta_phone_id}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${s.meta_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: String(phone).replace(/\D/g, ''), type: 'text', text: { body: message } }) });
  const result = await response.json();
  if (!response.ok) return { sent: false, warning: result?.error?.message || 'Meta API failed' };
  return { sent: true, result };
}

async function whatsappEvent(event, phone, parameters, fallback, media = {}) {
  const s = await settingsMap(), template = s[`wa_template_${event}`];
  if (!template) return whatsappText(phone, fallback);
  if (!s.meta_token || !s.meta_phone_id) return { sent: false, warning: 'Meta WhatsApp credentials are not configured' };
  if (!phone) return { sent: false, warning: 'Customer phone is missing' };
  const version = s.meta_api_version || 'v22.0', language = s[`wa_language_${event}`] || 'en', components = [];
  let definition = null;
  if (s.meta_waba_id) {
    try {
      const lookup = await fetch(`https://graph.facebook.com/${version}/${s.meta_waba_id}/message_templates?name=${encodeURIComponent(template)}&fields=name,status,language,components`, { headers: { Authorization: `Bearer ${s.meta_token}` } }), data = await lookup.json();
      definition = (data.data || []).find(x => x.name === template && x.language === language && x.status === 'APPROVED') || (data.data || []).find(x => x.name === template && x.language === language);
    } catch (e) { console.error('Meta template lookup failed', e.message); }
  }
  const defs = definition?.components || [], header = defs.find(x => x.type === 'HEADER'), bodyDef = defs.find(x => x.type === 'BODY'), buttons = defs.find(x => x.type === 'BUTTONS')?.buttons || [];
  if (header?.format === 'IMAGE' && media.headerImage) components.push({ type: 'header', parameters: [{ type: 'image', image: { link: media.headerImage } }] });
  const bodyCount = Math.max(...[...String(bodyDef?.text || '').matchAll(/\{\{(\d+)\}\}/g)].map(x => Number(x[1])), 0);
  if (bodyCount) components.push({ type: 'body', parameters: parameters.slice(0, bodyCount).map(value => ({ type: 'text', text: String(value ?? '') })) });
  const dynamicButton = buttons.findIndex(x => x.type === 'URL' && /\{\{1\}\}/.test(x.url || ''));
  if (dynamicButton >= 0 && media.buttonText) components.push({ type: 'button', sub_type: 'url', index: String(dynamicButton), parameters: [{ type: 'text', text: String(media.buttonText) }] });
  if (!definition && !components.length) components.push({ type: 'body', parameters: parameters.map(value => ({ type: 'text', text: String(value ?? '') })) });
  const response = await fetch(`https://graph.facebook.com/${version}/${s.meta_phone_id}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${s.meta_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: String(phone).replace(/\D/g, ''), type: 'template', template: { name: template, language: { code: language }, components } }) });
  const result = await response.json();
  if (!response.ok) {
    const error = result?.error || {}, detail = error?.error_data?.details || error?.error_user_msg || error?.error_user_title;
    console.error('Meta template send failed', { event, template, language, detail, code: error.code, subcode: error.error_subcode });
    return { sent: false, warning: [error.message, detail].filter(Boolean).join(' — ') || 'Meta template message failed' };
  }
  return { sent: true, result, template };
}

async function scheduleEstimateFollowup(estimateId) {
  if (await one("SELECT id FROM followups WHERE estimate_id=? AND status='pending'", estimateId)) return;
  const e = await one('SELECT e.id, e.customer_id, e.number, c.name FROM estimates e JOIN customers c ON c.id=e.customer_id WHERE e.id=?', estimateId);
  if (!e) return;
  const s = await settingsMap();
  const days = Math.max(1, Number(s.estimate_followup_days || 3)), date = new Date();
  date.setDate(date.getDate() + days);
  await run('INSERT INTO followups(customer_id, estimate_id, followup_date, message) VALUES(?, ?, ?, ?)', e.customer_id, e.id, date.toISOString().slice(0, 10), `We are following up regarding estimate ${e.number}. Please let us know if you have any questions or would like to proceed.`);
}

let followupRunnerBusy = false;
async function runAutomaticFollowups() {
  if (followupRunnerBusy) return;
  followupRunnerBusy = true;
  try {
    const s = await settingsMap();
    if (s.auto_followups === 'false') return;
    const hour = Math.min(23, Math.max(0, Number(s.followup_send_hour || 10)));
    if (new Date().getHours() < hour) return;
    const due = await rows(`SELECT f.id, f.message, f.estimate_id, c.name customer, c.phone, co.name company, e.status estimate_status, e.number estimate_number, e.total estimate_total FROM followups f JOIN customers c ON c.id=f.customer_id JOIN companies co ON co.id=f.company_id LEFT JOIN estimates e ON e.id=f.estimate_id WHERE f.status='pending' AND f.followup_date <= CURDATE() AND (f.last_sent_at IS NULL OR DATE(f.last_sent_at) < CURDATE()) AND (e.id IS NULL OR e.status NOT IN ('accepted', 'done', 'rejected', 'cancelled', 'expired')) ORDER BY f.followup_date ASC`);
    for (const f of due) {
      const wa = f.estimate_id ? await whatsappEvent('estimate_followup', f.phone, [f.customer, f.estimate_number, Number(f.estimate_total || 0).toFixed(2), f.company], `Hello ${f.customer}, ${f.message} — ${f.company}`) : await whatsappText(f.phone, `Hello ${f.customer}, ${f.message} — ${f.company}`);
      if (wa.sent) await run('UPDATE followups SET last_sent_at=NOW() WHERE id=?', f.id);
    }
  } catch (e) {
    console.error('Automatic follow-up error:', e.message);
  } finally {
    followupRunnerBusy = false;
  }
}

async function sendOverdueReminder(invoiceId, automatic = false) {
  const invoice = await one(`SELECT i.id, i.number, i.due_date, i.total, i.status, c.name customer, c.phone, co.name company, COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id=i.id), 0) paid FROM invoices i JOIN customers c ON c.id=i.customer_id JOIN companies co ON co.id=i.company_id WHERE i.id=?`, invoiceId);
  if (!invoice) return { sent: false, warning: 'Invoice not found' };
  if (['paid', 'cancelled'].includes(invoice.status)) return { sent: false, warning: 'This invoice has no overdue payment' };
  const pending = Math.max(0, Number(invoice.total) - Number(invoice.paid));
  if (pending <= 0) return { sent: false, warning: 'This invoice has no pending balance' };
  const amount = pending.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), fallback = `Hello ${invoice.customer}, payment of ₹${amount} for overdue invoice ${invoice.number} was due on ${invoice.due_date}. Please arrange payment at your earliest convenience. — ${invoice.company}`;
  const wa = await whatsappEvent('payment_reminder', invoice.phone, [invoice.customer, amount, invoice.company, invoice.number, invoice.due_date], fallback);
  if (wa.sent) {
    await run("UPDATE invoices SET status='overdue' WHERE id=? AND status NOT IN ('paid', 'cancelled')", invoice.id);
    if (automatic) await run("INSERT IGNORE INTO payment_reminder_logs(invoice_id, sent_date) VALUES(?, CURDATE())", invoice.id);
  }
  return wa;
}

let paymentReminderRunnerBusy = false;
async function runAutomaticPaymentReminders() {
  if (paymentReminderRunnerBusy) return;
  paymentReminderRunnerBusy = true;
  try {
    const s = await settingsMap();
    if (s.auto_payment_reminders === 'false') return;
    const hour = Math.min(23, Math.max(0, Number(s.payment_reminder_hour || 10)));
    if (new Date().getHours() < hour) return;
    const overdue = await rows(`SELECT i.id FROM invoices i WHERE i.due_date < CURDATE() AND i.status NOT IN ('paid', 'cancelled') AND i.total > COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id=i.id), 0) AND NOT EXISTS(SELECT 1 FROM payment_reminder_logs l WHERE l.invoice_id=i.id AND l.sent_date = CURDATE()) ORDER BY i.due_date ASC`);
    for (const invoice of overdue) await sendOverdueReminder(invoice.id, true);
  } catch (e) {
    console.error('Automatic payment reminder error:', e.message);
  } finally {
    paymentReminderRunnerBusy = false;
  }
}

setTimeout(() => { runAutomaticFollowups(); runAutomaticPaymentReminders(); }, 15000);
setInterval(() => { runAutomaticFollowups(); runAutomaticPaymentReminders(); }, 5 * 60 * 1000);

async function api(req, res, url) {
  const method = req.method; const p = url.pathname;
  if (p === '/api/setup-status') return json(res, 200, { needsSetup: (await one('SELECT COUNT(*) n FROM users')).n === 0 });
  if (p === '/api/reset-password' && method === 'GET') {
    const salt = crypto.randomBytes(16).toString('hex'), pass = salt + ':' + crypto.scryptSync('123456', salt, 64).toString('hex');
    await run("INSERT INTO users(id, name, email, password) VALUES(1, 'Gagandeep', 'admin@gmail.com', ?) ON DUPLICATE KEY UPDATE name='Gagandeep', password=VALUES(password)", pass);
    return json(res, 200, { ok: true, email: 'admin@gmail.com', password: '123456', message: 'Password reset to 123456 successfully' });
  }
  const publicLogo = p.match(/^\/api\/public\/company-logo\/(\d+)$/);
  if (publicLogo && method === 'GET') {
    const company = await one('SELECT logo FROM companies WHERE id=?', publicLogo[1]);
    const match = String(company?.logo || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) return json(res, 404, { error: 'Logo not found' });
    const bytes = Buffer.from(match[2], 'base64');
    res.writeHead(200, { 'Content-Type': match[1], 'Content-Length': bytes.length, 'Cache-Control': 'public, max-age=86400' });
    return res.end(bytes);
  }
  const publicInvoice = p.match(/^\/api\/public\/invoice\/(\d+)-([a-f0-9]{24})$/);
  if (publicInvoice && method === 'GET') {
    const expected = await invoiceLinkToken(publicInvoice[1]);
    if (!crypto.timingSafeEqual(Buffer.from(publicInvoice[2]), Buffer.from(expected))) return json(res, 403, { error: 'Invalid invoice link' });
    return sendInvoicePdf(res, publicInvoice[1]);
  }
  const publicEstimate = p.match(/^\/api\/public\/estimate\/(\d+)-([a-f0-9]{24})$/);
  if (publicEstimate && method === 'GET') {
    const expected = await estimateLinkToken(publicEstimate[1]);
    if (!crypto.timingSafeEqual(Buffer.from(publicEstimate[2]), Buffer.from(expected))) return json(res, 403, { error: 'Invalid estimate link' });
    return sendEstimatePdf(res, publicEstimate[1]);
  }
  if (p === '/api/setup' && method === 'POST') {
    const b = await body(req);
    const count = (await one('SELECT COUNT(*) n FROM users')).n;
    if (count) return json(res, 409, { error: 'Setup already completed' });
    if (!b?.name || !b?.email || String(b.password || '').length < 6) return json(res, 400, { error: 'Name, email and 6+ character password required' });
    await run('INSERT INTO users(name, email, password) VALUES(?, ?, ?)', b.name, b.email.toLowerCase(), hash(b.password));
    return login(res, b.email, b.password);
  }
  if (p === '/api/login' && method === 'POST') { const b = await body(req); return login(res, b?.email, b?.password); }
  if (p === '/api/logout' && method === 'POST') {
    await run('DELETE FROM sessions WHERE token=?', cookies(req).session || '');
    res.writeHead(204, { 'Set-Cookie': 'session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax' });
    return res.end();
  }
  const user = await auth(req);
  if (!user) return json(res, 401, { error: 'Please log in' });
  if (p === '/api/me') return json(res, 200, user);
  if (p === '/api/dashboard') {
    const invoiced = Number((await one("SELECT COALESCE(SUM(total),0) n FROM invoices WHERE status!='cancelled'")).n),
          paid = Number((await one('SELECT COALESCE(SUM(amount),0) n FROM payments')).n),
          companies = (await one('SELECT COUNT(*) n FROM companies')).n,
          customers = (await one('SELECT COUNT(*) n FROM customers')).n,
          invoices = (await one('SELECT COUNT(*) n FROM invoices')).n,
          monthlyInvoices = await rows("SELECT SUBSTR(invoice_date,1,7) month, SUM(total) amount FROM invoices WHERE status!='cancelled' GROUP BY month ORDER BY month DESC LIMIT 6"),
          monthlyPayments = await rows('SELECT SUBSTR(payment_date,1,7) month, SUM(amount) amount FROM payments GROUP BY month ORDER BY month DESC LIMIT 6'),
          statuses = await rows('SELECT status, COUNT(*) count FROM invoices GROUP BY status'),
          followups = await rows("SELECT f.id, f.followup_date, f.message, f.last_sent_at, c.name customer, c.business_name, c.phone, e.number estimate_number FROM followups f JOIN customers c ON c.id=f.customer_id LEFT JOIN estimates e ON e.id=f.estimate_id WHERE f.status='pending' ORDER BY f.followup_date ASC LIMIT 8"),
          dueFollowups = (await one("SELECT COUNT(*) n FROM followups WHERE status='pending' AND followup_date <= CURDATE()")).n,
          recent = await rows('SELECT i.*, c.name customer, co.name company FROM invoices i JOIN customers c ON c.id=i.customer_id JOIN companies co ON co.id=i.company_id ORDER BY i.id DESC LIMIT 6');
    return json(res, 200, { companies, customers, invoices, revenue: invoiced, paid, pending: Math.max(0, invoiced - paid), monthlyInvoices, monthlyPayments, statuses, followups, dueFollowups, recent });
  }
  if (p === '/api/domains' && method === 'GET') return json(res, 200, await rows("SELECT d.*, c.name customer, c.business_name, co.name company, CAST(DATEDIFF(d.renewal_date, CURDATE()) AS SIGNED) days_left FROM domains d JOIN customers c ON c.id=d.customer_id JOIN companies co ON co.id=d.company_id ORDER BY CASE WHEN d.status='active' THEN 0 ELSE 1 END, d.renewal_date ASC, d.domain_name ASC"));
  if (p === '/api/domains' && method === 'POST') {
    const b = await body(req);
    if (!b?.customer_id || !b?.domain_name || !b?.renewal_date) return json(res, 400, { error: 'Client, domain name and renewal date are required' });
    const customer = await one('SELECT company_id FROM customers WHERE id=?', b.customer_id);
    if (!customer) return json(res, 400, { error: 'Customer not found' });
    const r = await run('INSERT INTO domains(customer_id, company_id, domain_name, registrar, purchase_date, renewal_date, yearly_cost, auto_renew, status, notes) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', b.customer_id, customer.company_id, String(b.domain_name).trim().toLowerCase(), b.registrar || '', b.purchase_date || '', b.renewal_date, Number(b.yearly_cost || 0), b.auto_renew ? 1 : 0, b.status || 'active', b.notes || '');
    return json(res, 201, await one('SELECT * FROM domains WHERE id=?', r.lastInsertRowid));
  }
  const domainMatch = p.match(/^\/api\/domains\/(\d+)$/);
  if (domainMatch && method === 'PUT') {
    const b = await body(req), customer = await one('SELECT company_id FROM customers WHERE id=?', b?.customer_id);
    if (!customer || !b?.domain_name || !b?.renewal_date) return json(res, 400, { error: 'Client, domain name and renewal date are required' });
    await run('UPDATE domains SET customer_id=?, company_id=?, domain_name=?, registrar=?, purchase_date=?, renewal_date=?, yearly_cost=?, auto_renew=?, status=?, notes=? WHERE id=?', b.customer_id, customer.company_id, String(b.domain_name).trim().toLowerCase(), b.registrar || '', b.purchase_date || '', b.renewal_date, Number(b.yearly_cost || 0), b.auto_renew ? 1 : 0, b.status || 'active', b.notes || '', domainMatch[1]);
    return json(res, 200, { ok: true });
  }
  if (domainMatch && method === 'DELETE') { await run('DELETE FROM domains WHERE id=?', domainMatch[1]); return json(res, 200, { ok: true }); }
  if (p === '/api/domain-renewals' && method === 'GET') return json(res, 200, await rows("SELECT d.*, c.name customer, c.business_name, c.phone, co.name company, CAST(DATEDIFF(d.renewal_date, CURDATE()) AS SIGNED) days_left FROM domains d JOIN customers c ON c.id=d.customer_id JOIN companies co ON co.id=d.company_id WHERE d.status='active' AND d.renewal_date <= DATE_ADD(CURDATE(), INTERVAL 60 DAY) ORDER BY d.renewal_date ASC"));
  const domainReminder = p.match(/^\/api\/domains\/(\d+)\/reminder$/);
  if (domainReminder && method === 'POST') {
    const d = await one('SELECT d.*, c.name customer, c.phone, co.name company FROM domains d JOIN customers c ON c.id=d.customer_id JOIN companies co ON co.id=d.company_id WHERE d.id=?', domainReminder[1]);
    if (!d) return json(res, 404, { error: 'Domain not found' });
    const cost = Number(d.yearly_cost || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), message = `Hello ${d.customer}, your domain ${d.domain_name} is due for renewal on ${d.renewal_date}${d.yearly_cost ? ` (renewal cost ₹${cost})` : ''}. Please confirm renewal to avoid website or email interruption. — ${d.company}`;
    const wa = await whatsappText(d.phone, message);
    if (!wa.sent) return json(res, 400, { error: wa.warning });
    return json(res, 200, wa);
  }
  if (p === '/api/reports' && method === 'GET') {
    const from = url.searchParams.get('from') || '0000-01-01', to = url.searchParams.get('to') || '9999-12-31', customerId = Number(url.searchParams.get('customer_id') || 0), companyId = Number(url.searchParams.get('company_id') || 0);
    const invoices = await rows(`SELECT i.id, i.number, i.invoice_date, i.status, i.subtotal, i.tax_total, i.total, i.gst_enabled, c.id customer_id, c.name customer, c.business_name, co.id company_id, co.name company FROM invoices i JOIN customers c ON c.id=i.customer_id JOIN companies co ON co.id=i.company_id WHERE i.status!='cancelled' AND i.invoice_date BETWEEN ? AND ? AND (?=0 OR c.id=?) AND (?=0 OR co.id=?) ORDER BY i.invoice_date DESC, i.id DESC`, from, to, customerId, customerId, companyId, companyId);
    const payments = await rows(`SELECT p.id, p.payment_date, p.amount, p.mode, p.reference, c.id customer_id, c.name customer, c.business_name, co.id company_id, co.name company, i.number invoice_number FROM payments p JOIN customers c ON c.id=p.customer_id JOIN companies co ON co.id=p.company_id LEFT JOIN invoices i ON i.id=p.invoice_id WHERE p.payment_date BETWEEN ? AND ? AND (?=0 OR c.id=?) AND (?=0 OR co.id=?) ORDER BY p.payment_date DESC, p.id DESC`, from, to, customerId, customerId, companyId, companyId);
    const clientMap = new Map();
    for (const i of invoices) { const x = clientMap.get(i.customer_id) || { customer_id: i.customer_id, customer: i.business_name || i.customer, company: i.company, invoiced: 0, paid: 0, tax: 0 }; x.invoiced += Number(i.total); x.tax += Number(i.tax_total); clientMap.set(i.customer_id, x); }
    for (const pmt of payments) { const x = clientMap.get(pmt.customer_id) || { customer_id: pmt.customer_id, customer: pmt.business_name || pmt.customer, company: pmt.company, invoiced: 0, paid: 0, tax: 0 }; x.paid += Number(pmt.amount); clientMap.set(pmt.customer_id, x); }
    return json(res, 200, { from, to, invoices, payments, clients: [...clientMap.values()], summary: { invoiced: invoices.reduce((s, x) => s + Number(x.total), 0), taxable: invoices.reduce((s, x) => s + Number(x.subtotal), 0), gst: invoices.reduce((s, x) => s + Number(x.tax_total), 0), paid: payments.reduce((s, x) => s + Number(x.amount), 0) } });
  }
  const resources = { companies: ['name', 'gstin', 'address', 'email', 'phone', 'bank_details', 'logo', 'invoice_prefix'], customers: ['company_id', 'name', 'business_name', 'email', 'phone', 'gstin', 'address', 'notes'], items: ['name', 'code', 'description', 'unit', 'price', 'gst_rate'] };
  for (const [table, fields] of Object.entries(resources)) {
    if (p === `/api/${table}` && method === 'GET') return json(res, 200, await rows(`SELECT * FROM ${table} ORDER BY id DESC`));
    if (p === `/api/${table}` && method === 'POST') { const b = clean(await body(req), fields); if (!b.name) return json(res, 400, { error: 'Name is required' }); const q = fields.map(() => '?').join(','); const r = await run(`INSERT INTO ${table}(${fields.join(',')}) VALUES(${q})`, ...fields.map(k => b[k])); return json(res, 201, await one(`SELECT * FROM ${table} WHERE id=?`, r.lastInsertRowid)); }
    if (p === `/api/${table}/save` && method === 'POST') { const raw = await body(req), id = Number(raw?.id), b = clean(raw, fields); if (!id || !(await one(`SELECT id FROM ${table} WHERE id=?`, id))) return json(res, 404, { error: `${table.slice(0, -1)} not found` }); if (!b.name) return json(res, 400, { error: 'Name is required' }); await run(`UPDATE ${table} SET ${fields.map(k => k + '=?').join(',')} WHERE id=?`, ...fields.map(k => b[k]), id); return json(res, 200, await one(`SELECT * FROM ${table} WHERE id=?`, id)); }
    if (p === `/api/${table}/delete` && method === 'POST') { const raw = await body(req), id = Number(raw?.id); if (!id || !(await one(`SELECT id FROM ${table} WHERE id=?`, id))) return json(res, 404, { error: `${table.slice(0, -1)} not found` }); await run(`DELETE FROM ${table} WHERE id=?`, id); return json(res, 200, { ok: true }); }
    const m = p.match(new RegExp(`^/api/${table}/(\\d+)$`)); if (m && method === 'PUT') { const b = clean(await body(req), fields); await run(`UPDATE ${table} SET ${fields.map(k => k + '=?').join(',')} WHERE id=?`, ...fields.map(k => b[k]), m[1]); return json(res, 200, await one(`SELECT * FROM ${table} WHERE id=?`, m[1])); } if (m && method === 'DELETE') { await run(`DELETE FROM ${table} WHERE id=?`, m[1]); return json(res, 200, { ok: true }); }
  }
  if (p === '/api/invoices' && method === 'GET') return json(res, 200, await rows('SELECT i.*, c.name customer, co.name company FROM invoices i JOIN customers c ON c.id=i.customer_id JOIN companies co ON co.id=i.company_id ORDER BY i.id DESC'));
  if (p === '/api/invoices/delete' && method === 'POST') {
    const b = await body(req), invoiceId = Number(b?.id);
    if (!invoiceId || !(await one('SELECT id FROM invoices WHERE id=?', invoiceId))) return json(res, 404, { error: 'Invoice not found' });
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('UPDATE payments SET invoice_id=NULL WHERE invoice_id=?', [invoiceId]);
      await conn.execute('DELETE FROM invoices WHERE id=?', [invoiceId]);
      await conn.commit();
      return json(res, 200, { ok: true });
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  }
  if (p === '/api/invoices' && method === 'POST') {
    const b = await body(req);
    if (!b?.company_id || !b?.customer_id || !b.lines?.length) return json(res, 400, { error: 'Company, customer and at least one item required' });
    const co = await one('SELECT * FROM companies WHERE id=?', b.company_id);
    const number = b.number || `${co.invoice_prefix || 'INV'}-${String(co.next_invoice).padStart(4, '0')}`;
    const subtotal = b.lines.reduce((s, l) => s + (+l.quantity || 0) * (+l.price || 0), 0);
    const tax = b.gst_enabled ? b.lines.reduce((s, l) => s + ((+l.quantity || 0) * (+l.price || 0) * (+l.gst_rate || 0) / 100), 0) : 0;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [r] = await conn.execute('INSERT INTO invoices(company_id, customer_id, number, po_number, invoice_date, due_date, status, gst_enabled, notes, subtotal, tax_total, total) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [b.company_id, b.customer_id, number, b.po_number || '', b.invoice_date, b.due_date, 'draft', b.gst_enabled ? 1 : 0, b.notes || '', subtotal, tax, subtotal + tax]);
      for (const l of b.lines) {
        await conn.execute('INSERT INTO invoice_lines(invoice_id, item_id, name, description, quantity, price, gst_rate, amount) VALUES(?, ?, ?, ?, ?, ?, ?, ?)', [r.insertId, l.item_id || null, l.name, l.description || '', +l.quantity || 0, +l.price || 0, +l.gst_rate || 0, (+l.quantity || 0) * (+l.price || 0)]);
      }
      await conn.execute('UPDATE companies SET next_invoice=next_invoice+1 WHERE id=?', [b.company_id]);
      await conn.commit();
      return json(res, 201, { id: Number(r.insertId) });
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  }
  const im = p.match(/^\/api\/invoices\/(\d+)$/);
  if (im && method === 'GET') {
    const invoice = await one('SELECT i.*, c.name customer_name, c.business_name customer_business, c.email customer_email, c.phone customer_phone, c.gstin customer_gstin, c.address customer_address, co.name company_name, co.gstin company_gstin, co.address company_address, co.email company_email, co.phone company_phone, co.bank_details, co.logo FROM invoices i JOIN customers c ON c.id=i.customer_id JOIN companies co ON co.id=i.company_id WHERE i.id=?', im[1]);
    if (!invoice) return json(res, 404, { error: 'Not found' });
    invoice.lines = await rows('SELECT * FROM invoice_lines WHERE invoice_id=?', im[1]);
    return json(res, 200, invoice);
  }
  if (im && method === 'PATCH') {
    const b = await body(req);
    if (!['draft', 'sent', 'paid', 'overdue', 'cancelled'].includes(b?.status)) return json(res, 400, { error: 'Invalid status' });
    await run('UPDATE invoices SET status=? WHERE id=?', b.status, im[1]);
    return json(res, 200, { ok: true });
  }
  const invoiceDelete = p.match(/^\/api\/invoices\/(\d+)\/delete$/);
  if ((im && method === 'DELETE') || (invoiceDelete && method === 'POST')) {
    const invoiceId = (im || invoiceDelete)[1];
    if (!(await one('SELECT id FROM invoices WHERE id=?', invoiceId))) return json(res, 404, { error: 'Invoice not found' });
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('UPDATE payments SET invoice_id=NULL WHERE invoice_id=?', [invoiceId]);
      await conn.execute('DELETE FROM invoices WHERE id=?', [invoiceId]);
      await conn.commit();
      return json(res, 200, { ok: true });
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  }
  const pdf = p.match(/^\/api\/invoices\/(\d+)\/pdf$/); if (pdf && method === 'GET') return sendInvoicePdf(res, pdf[1]);
  if (p === '/api/estimates' && method === 'GET') return json(res, 200, await rows('SELECT e.*, c.name customer, co.name company FROM estimates e JOIN customers c ON c.id=e.customer_id JOIN companies co ON co.id=e.company_id ORDER BY e.id DESC'));
  if (p === '/api/estimates' && method === 'POST') {
    const b = await body(req);
    if (!b?.company_id || !b?.customer_id || !b.lines?.length) return json(res, 400, { error: 'Company, customer and at least one item required' });
    const count = (await one('SELECT COUNT(*) n FROM estimates')).n;
    const number = b.number || `EST-${String(count + 1).padStart(4, '0')}`;
    const s = await settingsMap(), subtotal = b.lines.reduce((s, l) => s + (+l.quantity || 0) * (+l.price || 0), 0), rate = Number(s.gst_rate || 18), tax = b.gst_enabled ? subtotal * rate / 100 : 0;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [r] = await conn.execute('INSERT INTO estimates(company_id, customer_id, number, estimate_date, due_date, status, gst_enabled, notes, subtotal, tax_total, total) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [b.company_id, b.customer_id, number, b.estimate_date, b.due_date, 'draft', b.gst_enabled ? 1 : 0, b.notes || '', subtotal, tax, subtotal + tax]);
      for (const l of b.lines) {
        await conn.execute('INSERT INTO estimate_lines(estimate_id, item_id, name, description, quantity, price, gst_rate, amount) VALUES(?, ?, ?, ?, ?, ?, ?, ?)', [r.insertId, l.item_id || null, l.name, l.description || '', +l.quantity || 0, +l.price || 0, rate, (+l.quantity || 0) * (+l.price || 0)]);
      }
      await conn.commit();
      return json(res, 201, { id: Number(r.insertId) });
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  }
  const em = p.match(/^\/api\/estimates\/(\d+)$/);
  if (em && method === 'GET') {
    const estimate = await one('SELECT e.*, c.name customer_name, c.business_name customer_business, c.email customer_email, c.phone customer_phone, c.gstin customer_gstin, c.address customer_address, co.name company_name, co.gstin company_gstin, co.address company_address, co.email company_email, co.phone company_phone, co.bank_details, co.logo FROM estimates e JOIN customers c ON c.id=e.customer_id JOIN companies co ON co.id=e.company_id WHERE e.id=?', em[1]);
    if (!estimate) return json(res, 404, { error: 'Not found' });
    estimate.lines = await rows('SELECT * FROM estimate_lines WHERE estimate_id=?', em[1]);
    return json(res, 200, estimate);
  }
  if (em && method === 'PATCH') {
    const b = await body(req);
    if (!['draft', 'sent', 'accepted', 'done', 'rejected', 'cancelled', 'expired'].includes(b?.status)) return json(res, 400, { error: 'Invalid status' });
    await run('UPDATE estimates SET status=? WHERE id=?', b.status, em[1]);
    if (b.status === 'sent') await scheduleEstimateFollowup(em[1]);
    if (['accepted', 'done', 'rejected', 'cancelled', 'expired'].includes(b.status)) await run("UPDATE followups SET status='completed' WHERE estimate_id=? AND status='pending'", em[1]);
    return json(res, 200, { ok: true });
  }
  if (em && method === 'DELETE') { await run('DELETE FROM estimates WHERE id=?', em[1]); return json(res, 200, { ok: true }); }
  const epdf = p.match(/^\/api\/estimates\/(\d+)\/pdf$/); if (epdf && method === 'GET') return sendEstimatePdf(res, epdf[1]);
  const esend = p.match(/^\/api\/estimates\/(\d+)\/whatsapp$/);
  if (esend && method === 'POST') {
    const e = await one('SELECT e.*, c.name customer, c.phone, co.name company, co.logo FROM estimates e JOIN customers c ON c.id=e.customer_id JOIN companies co ON co.id=e.company_id WHERE e.id=?', esend[1]);
    if (!e) return json(res, 404, { error: 'Estimate not found' });
    const s = await settingsMap(), origin = s.public_base_url || 'https://nfc.officialsolutions.in', total = Number(e.total).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), media = { headerImage: e.logo ? `${origin.replace(/\/$/, '')}/api/public/company-logo/${e.company_id}` : null, buttonText: `${e.id}-${await estimateLinkToken(e.id)}` };
    const wa = await whatsappEvent('estimate_created', e.phone, [e.customer, total, e.number, e.due_date, e.company], `Hello ${e.customer}, estimate ${e.number} for ₹${total} is ready. Please review it. — ${e.company}`, media);
    if (!wa.sent) return json(res, 400, { error: wa.warning });
    await run("UPDATE estimates SET status='sent' WHERE id=?", esend[1]);
    await scheduleEstimateFollowup(esend[1]);
    return json(res, 200, { ...wa, followup_scheduled: true });
  }
  if (p === '/api/ledger' && method === 'GET') return json(res, 200, await rows(`SELECT c.id, c.name, c.business_name, c.phone, co.name company, COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.customer_id=c.id AND i.status!='cancelled'), 0) invoiced, COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.customer_id=c.id), 0) paid FROM customers c JOIN companies co ON co.id=c.company_id ORDER BY c.name`));
  const ledger = p.match(/^\/api\/customers\/(\d+)\/ledger$/);
  if (ledger && method === 'GET') {
    const customer = await one('SELECT c.*, co.name company_name FROM customers c JOIN companies co ON co.id=c.company_id WHERE c.id=?', ledger[1]);
    if (!customer) return json(res, 404, { error: 'Customer not found' });
    const invoices = await rows(`SELECT i.*, COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id=i.id), 0) paid FROM invoices i WHERE i.customer_id=? AND i.status!='cancelled' ORDER BY i.invoice_date DESC, i.id DESC`, ledger[1]);
    const payments = await rows('SELECT p.*, i.number invoice_number FROM payments p LEFT JOIN invoices i ON i.id=p.invoice_id WHERE p.customer_id=? ORDER BY p.payment_date DESC, p.id DESC', ledger[1]);
    return json(res, 200, { customer, invoices, payments, total_invoiced: invoices.reduce((s, x) => s + Number(x.total), 0), total_paid: payments.reduce((s, x) => s + Number(x.amount), 0) });
  }
  if (p === '/api/payments' && method === 'POST') {
    const b = await body(req); const amount = Number(b?.amount);
    if (!b?.customer_id || !b?.company_id || !amount || amount <= 0 || !b?.payment_date) return json(res, 400, { error: 'Customer, positive amount and payment date are required' });
    if (b.invoice_id) { const inv = await one('SELECT * FROM invoices WHERE id=? AND customer_id=?', b.invoice_id, b.customer_id); if (!inv) return json(res, 400, { error: 'Invoice does not belong to this customer' }); }
    const r = await run('INSERT INTO payments(customer_id, company_id, invoice_id, amount, payment_date, mode, reference, note) VALUES(?, ?, ?, ?, ?, ?, ?, ?)', b.customer_id, b.company_id, b.invoice_id || null, amount, b.payment_date, b.mode || 'bank', b.reference || '', b.note || '');
    if (b.invoice_id) {
      const inv = await one('SELECT total FROM invoices WHERE id=?', b.invoice_id);
      const paid = (await one('SELECT COALESCE(SUM(amount), 0) n FROM payments WHERE invoice_id=?', b.invoice_id)).n;
      await run('UPDATE invoices SET status=? WHERE id=?', Number(paid) >= Number(inv.total) ? 'paid' : 'sent', b.invoice_id);
    }
    const c = await one('SELECT c.*, co.name company_name FROM customers c JOIN companies co ON co.id=c.company_id WHERE c.id=?', b.customer_id);
    const outstanding = (await one(`SELECT COALESCE((SELECT SUM(total) FROM invoices WHERE customer_id=? AND status!='cancelled'), 0) - COALESCE((SELECT SUM(amount) FROM payments WHERE customer_id=?), 0) n`, b.customer_id, b.customer_id)).n;
    const balance = Math.max(0, Number(outstanding)), wa = b.send_whatsapp === false ? { sent: false } : await whatsappEvent('payment_received', c.phone, [c.name, amount.toFixed(2), b.payment_date, b.reference || 'N/A', balance.toFixed(2), c.company_name], `Hello ${c.name}, we received your payment of ₹${amount.toFixed(2)} on ${b.payment_date}. Pending balance: ₹${balance.toFixed(2)}. Thank you — ${c.company_name}`);
    return json(res, 201, { payment: await one('SELECT * FROM payments WHERE id=?', r.lastInsertRowid), whatsapp: wa });
  }
  const reminder = p.match(/^\/api\/customers\/(\d+)\/reminder$/);
  if (reminder && method === 'POST') {
    const c = await one('SELECT c.*, co.name company_name FROM customers c JOIN companies co ON co.id=c.company_id WHERE c.id=?', reminder[1]);
    if (!c) return json(res, 404, { error: 'Customer not found' });
    const pending = (await one(`SELECT COALESCE((SELECT SUM(total) FROM invoices WHERE customer_id=? AND status!='cancelled'), 0) - COALESCE((SELECT SUM(amount) FROM payments WHERE customer_id=?), 0) n`, reminder[1], reminder[1])).n;
    if (Number(pending) <= 0) return json(res, 400, { error: 'No pending balance' });
    const wa = await whatsappEvent('payment_reminder', c.phone, [c.name, Number(pending).toFixed(2), c.company_name], `Hello ${c.name}, this is a friendly payment reminder. Your pending balance is ₹${Number(pending).toFixed(2)}. Please arrange payment at your earliest convenience. — ${c.company_name}`);
    if (!wa.sent) return json(res, 400, { error: wa.warning });
    return json(res, 200, wa);
  }
  if (p === '/api/followups' && method === 'GET') return json(res, 200, await rows("SELECT f.*, c.name customer, c.business_name, c.phone, e.number estimate_number FROM followups f JOIN customers c ON c.id=f.customer_id LEFT JOIN estimates e ON e.id=f.estimate_id ORDER BY CASE WHEN f.status='pending' THEN 0 ELSE 1 END, f.followup_date ASC"));
  if (p === '/api/followups' && method === 'POST') {
    const b = await body(req);
    if (!b?.customer_id || !b?.followup_date || !b?.message) return json(res, 400, { error: 'Customer, date and message are required' });
    const r = await run('INSERT INTO followups(customer_id, followup_date, message) VALUES(?, ?, ?)', b.customer_id, b.followup_date, b.message);
    return json(res, 201, await one('SELECT * FROM followups WHERE id=?', r.lastInsertRowid));
  }
  const fm = p.match(/^\/api\/followups\/(\d+)$/);
  if (fm && method === 'PATCH') { const b = await body(req); await run('UPDATE followups SET status=? WHERE id=?', b.status === 'completed' ? 'completed' : 'pending', fm[1]); return json(res, 200, { ok: true }); }
  if (fm && method === 'DELETE') { await run('DELETE FROM followups WHERE id=?', fm[1]); return json(res, 200, { ok: true }); }
  const fsend = p.match(/^\/api\/followups\/(\d+)\/send$/);
  if (fsend && method === 'POST') {
    const f = await one('SELECT f.*, c.name customer, c.phone, co.name company, e.number estimate_number, e.total estimate_total FROM followups f JOIN customers c ON c.id=f.customer_id JOIN companies co ON co.id=f.company_id LEFT JOIN estimates e ON e.id=f.estimate_id WHERE f.id=?', fsend[1]);
    if (!f) return json(res, 404, { error: 'Follow-up not found' });
    const wa = f.estimate_id ? await whatsappEvent('estimate_followup', f.phone, [f.customer, f.estimate_number, Number(f.estimate_total || 0).toFixed(2), f.company], `Hello ${f.customer}, ${f.message} — ${f.company}`) : await whatsappText(f.phone, `Hello ${f.customer}, ${f.message} — ${f.company}`);
    if (!wa.sent) return json(res, 400, { error: wa.warning });
    await run('UPDATE followups SET last_sent_at=NOW() WHERE id=?', fsend[1]);
    return json(res, 200, wa);
  }
  if (p === '/api/settings' && method === 'GET') return json(res, 200, await settingsMap());
  if (p === '/api/backup/sql' && method === 'GET') {
    let sql = '-- Exported MySQL Data\nSET FOREIGN_KEY_CHECKS=0;\n\n';
    const tables = ['users', 'companies', 'customers', 'items', 'invoices', 'invoice_lines', 'estimates', 'estimate_lines', 'payments', 'followups', 'domains', 'settings'];
    for (const table of tables) {
      try {
        const data = await rows(`SELECT * FROM ${table}`);
        if (!data.length) continue;
        sql += `-- Data for table \`${table}\`\n`;
        for (const row of data) {
          const keys = Object.keys(row).map(k => `\`${k}\``).join(', ');
          const values = Object.values(row).map(v => {
            if (v === null || v === undefined) return 'NULL';
            if (typeof v === 'number') return v;
            return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
          }).join(', ');
          sql += `INSERT INTO \`${table}\` (${keys}) VALUES (${values});\n`;
        }
        sql += '\n';
      } catch (e) { }
    }
    sql += 'SET FOREIGN_KEY_CHECKS=1;\n';
    const date = new Date().toISOString().slice(0, 10);
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="billflow_backup_${date}.sql"` });
    return res.end(sql);
  }
  if ((p === '/api/settings' && method === 'PUT') || (p === '/api/settings/save' && method === 'POST')) {
    const b = await body(req);
    for (const [k, v] of Object.entries(b || {})) {
      await run('INSERT INTO settings(`key`, `value`) VALUES(?, ?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`)', k, String(v ?? ''));
    }
    return json(res, 200, { ok: true });
  }
  if (p === '/api/meta/templates' && method === 'GET') {
    const s = await settingsMap();
    if (!s.meta_token || !s.meta_waba_id) return json(res, 400, { error: 'Add Meta access token and WhatsApp Business Account ID in Settings' });
    const version = s.meta_api_version || 'v22.0', response = await fetch(`https://graph.facebook.com/${version}/${s.meta_waba_id}/message_templates?fields=id,name,status,category,language,components,quality_score&limit=200`, { headers: { Authorization: `Bearer ${s.meta_token}` } }), result = await response.json();
    if (!response.ok) return json(res, response.status, { error: result?.error?.message || 'Could not load Meta templates' });
    return json(res, 200, result);
  }
  if (p === '/api/meta/templates' && method === 'POST') {
    const s = await settingsMap(), b = await body(req);
    if (!s.meta_token || !s.meta_waba_id) return json(res, 400, { error: 'Add Meta access token and WhatsApp Business Account ID in Settings' });
    if (!/^[a-z0-9_]+$/.test(b?.name || '')) return json(res, 400, { error: 'Template name can only contain lowercase letters, numbers and underscores' });
    if (!b?.body) return json(res, 400, { error: 'Template body is required' });
    const components = [];
    if (b.header) components.push({ type: 'HEADER', format: 'TEXT', text: b.header, example: b.header_examples?.length ? { header_text: b.header_examples } : undefined });
    components.push({ type: 'BODY', text: b.body, example: b.body_examples?.length ? { body_text: [b.body_examples] } : undefined });
    if (b.footer) components.push({ type: 'FOOTER', text: b.footer });
    const version = s.meta_api_version || 'v22.0', response = await fetch(`https://graph.facebook.com/${version}/${s.meta_waba_id}/message_templates`, { method: 'POST', headers: { Authorization: `Bearer ${s.meta_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: b.name, language: b.language || 'en', category: b.category || 'UTILITY', allow_category_change: true, components }) }), result = await response.json();
    if (!response.ok) return json(res, response.status, { error: result?.error?.error_user_msg || result?.error?.message || 'Template submission failed' });
    return json(res, 201, result);
  }
  if (p === '/api/meta/templates' && method === 'DELETE') {
    const s = await settingsMap(), name = url.searchParams.get('name');
    if (!s.meta_token || !s.meta_waba_id) return json(res, 400, { error: 'Meta credentials are missing' });
    if (!name) return json(res, 400, { error: 'Template name is required' });
    const version = s.meta_api_version || 'v22.0', response = await fetch(`https://graph.facebook.com/${version}/${s.meta_waba_id}/message_templates?name=${encodeURIComponent(name)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${s.meta_token}` } }), result = await response.json();
    if (!response.ok) return json(res, response.status, { error: result?.error?.message || 'Template deletion failed' });
    return json(res, 200, result);
  }
  const overdueReminder = p.match(/^\/api\/invoices\/(\d+)\/overdue-reminder$/);
  if (overdueReminder && method === 'POST') {
    const result = await sendOverdueReminder(overdueReminder[1]);
    if (!result.sent) return json(res, 400, { error: result.warning });
    return json(res, 200, result);
  }
  const send = p.match(/^\/api\/invoices\/(\d+)\/whatsapp$/);
  if (send && method === 'POST') {
    const inv = await one('SELECT i.*, c.phone, c.name customer, co.name company, co.logo FROM invoices i JOIN customers c ON c.id=i.customer_id JOIN companies co ON co.id=i.company_id WHERE i.id=?', send[1]);
    if (!inv) return json(res, 404, { error: 'Invoice not found' });
    const s = await settingsMap(), origin = s.public_base_url || 'https://nfc.officialsolutions.in';
    const media = { headerImage: inv.logo ? `${origin.replace(/\/$/, '')}/api/public/company-logo/${inv.company_id}` : null, buttonText: `${inv.id}-${await invoiceLinkToken(inv.id)}` };
    const total = Number(inv.total).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const wa = await whatsappEvent('invoice_created', inv.phone, [inv.customer, total, inv.number, inv.invoice_date, inv.due_date, inv.company], `Hello ${inv.customer}, invoice ${inv.number} for ₹${total} has been created.`, media);
    if (!wa.sent) return json(res, 400, { error: wa.warning });
    await run("UPDATE invoices SET status='sent' WHERE id=?", send[1]);
    return json(res, 200, wa);
  }
  return json(res, 404, { error: 'Not found' });
}

function login(res, email, password) {
  one('SELECT * FROM users WHERE email=?', String(email || '').toLowerCase()).then(u => {
    if (!u || !validPassword(String(password || ''), u.password)) return json(res, 401, { error: 'Invalid email or password' });
    const token = crypto.randomBytes(32).toString('hex');
    run('INSERT INTO sessions(token, user_id, expires_at) VALUES(?, ?, ?)', token, u.id, Date.now() + 604800000).then(() => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': `session=${token}; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax` });
      res.end(JSON.stringify({ id: u.id, name: u.name, email: u.email }));
    });
  }).catch(e => json(res, 500, { error: e.message }));
}

async function serve(res, url) {
  let file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if (file.includes('..')) return json(res, 403, { error: 'Forbidden' });
  let full = path.join(root, 'public', file);
  if (!existsSync(full)) { res.writeHead(404); return res.end('Not found'); }
  const ext = path.extname(full);
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  res.end(await readFile(full));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else await serve(res, url);
  } catch (e) { console.error(e); json(res, 500, { error: 'Server error: ' + e.message }); }
});

server.listen(process.env.PORT || 3000, () => console.log(`Invoice CRM running with MySQL at http://localhost:${process.env.PORT || 3000}`));
