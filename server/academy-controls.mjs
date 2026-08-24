import 'dotenv/config';
import jwt from 'jsonwebtoken';
import fs from 'node:fs/promises';
import { google } from 'googleapis';

const app = globalThis.__kayanApp;
const data = globalThis.__kayanData;
if (!app || !data) throw new Error('KAYAN_CONTROLS_INIT_FAILED');

const id = v => String(v ?? '').replace(/\D/g, '');
const norm = v => String(v ?? '').trim().toLowerCase().replace(/[\u064B-\u065F\u0670\u0640\s_\-#]+/g, '');
const envAdmins = new Set(String(process.env.ACADEMY_ADMIN_IDS || '').split(',').map(id).filter(Boolean));
const permissions = {
  view_dashboard: 'لوحة الإدارة',
  manage_members: 'إدارة الأفراد',
  manage_roles: 'إدارة الرتب',
  manage_admins: 'إدارة الأدمن',
  manage_applications: 'إدارة التقديمات',
  manage_exams: 'إدارة الاختبارات',
  manage_hierarchy: 'إدارة الهيكل',
  view_evaluations: 'الاطلاع على التقييمات',
  manage_evaluations: 'إدارة التقييمات',
  manage_settings: 'الإعدادات'
};
const ALL = Object.keys(permissions);
const DATA_SHEET_ID = process.env.ACADEMY_GOOGLE_SHEET_ID || process.env.GOOGLE_ACADEMY_DATA_SHEET_ID || '1s_VqyiWsFMQaLwemqhyqdzN8zB6lQa81NtF1-XvfuAk';
const DATA_SHEET = process.env.ACADEMY_GOOGLE_SHEET_NAME || process.env.GOOGLE_ACADEMY_DATA_SHEET_NAME || 'DATA';
const IMAGE_SHEET = 'Member Images';
const POLICE_SHEET_ID = process.env.GOOGLE_SHEET_ID || process.env.POLICE_SHEET_ID || '1J1cWiWn_yOhy3G7coTOwq6AoS9OZvW8rul1_gzZ8uRc';
const POLICE_RANGE = process.env.GOOGLE_SHEET_RANGE || process.env.POLICE_SHEET_RANGE || 'officers!B4:H';
const SERVICE_FILE = process.env.GOOGLE_SERVICE_ACCOUNT_FILE || '/etc/secrets/google-service-account.json';
let credentials;
let sheets;
let imageCache = new Map();
let imageCacheAt = 0;

const register = (method, route, handler) => {
  app[method](route, handler);
  const stack = app._router?.stack || [];
  const routeIndex = stack.findIndex(layer => layer.route?.path === route);
  const fallbackIndex = globalThis.__kayanFallback ? stack.findIndex(layer => layer.handle === globalThis.__kayanFallback) : -1;
  if (routeIndex >= 0 && fallbackIndex >= 0 && routeIndex > fallbackIndex) {
    const [layer] = stack.splice(routeIndex, 1);
    stack.splice(fallbackIndex, 0, layer);
  }
};

const session = req => {
  try { return jwt.verify(req.cookies?.kayan_session, String(process.env.SESSION_SECRET || '')); }
  catch { return null; }
};
const uid = req => id(session(req)?.id);
const adminRecord = userId => data.admins?.find(a => id(a.discordId) === id(userId));
const isSuperAdmin = userId => envAdmins.has(id(userId));
const can = (req, permission) => {
  const userId = uid(req);
  if (!userId) return false;
  if (isSuperAdmin(userId)) return true;
  const a = adminRecord(userId);
  return Boolean(a?.enabled && (a.permissions || []).includes(permission));
};
const requirePermission = (req, res, permission) => {
  if (!uid(req)) { res.status(401).json({ error: 'UNAUTHENTICATED' }); return false; }
  if (!can(req, permission)) { res.status(403).json({ error: 'INSUFFICIENT_PERMISSION' }); return false; }
  return true;
};

async function service() {
  if (sheets) return sheets;
  if (!credentials) {
    const raw = String(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim() || await fs.readFile(SERVICE_FILE, 'utf8');
    credentials = JSON.parse(raw);
  }
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  sheets = google.sheets({ version: 'v4', auth });
  return sheets;
}

async function ensureSheet(title) {
  const s = await service();
  const meta = await s.spreadsheets.get({ spreadsheetId: DATA_SHEET_ID, fields: 'sheets.properties' });
  const exists = (meta.data.sheets || []).some(x => x.properties?.title === title);
  if (exists) return;
  try {
    await s.spreadsheets.batchUpdate({
      spreadsheetId: DATA_SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title } } }] }
    });
  } catch (e) {
    if (!/already exists|alreadyExists|duplicate/i.test(String(e?.message || e))) throw e;
  }
}

async function saveData() {
  const s = await service();
  await s.spreadsheets.values.update({
    spreadsheetId: DATA_SHEET_ID,
    range: `${DATA_SHEET}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [[JSON.stringify(data)]] }
  });
}

async function policeRows() {
  const s = await service();
  const r = await s.spreadsheets.values.get({ spreadsheetId: POLICE_SHEET_ID, range: POLICE_RANGE });
  const values = r.data.values || [];
  const headers = values[0] || [];
  const index = (names, fallback) => {
    const h = headers.map(norm);
    for (const name of names) {
      const n = norm(name);
      const i = h.findIndex(x => x === n || x.includes(n) || n.includes(x));
      if (i >= 0) return i;
    }
    return fallback;
  };
  const badge = index(['Badge #', 'Badge', 'البادج', 'الكود'], 0);
  const name = index(['الاسم', 'name'], 1);
  const rank = index(['الرتبة', 'الرتبه', 'rank'], 3);
  const responsibility = index(['المسؤولية', 'المسؤوليه', 'responsibility'], 5);
  const discord = index(['ديسكورد', 'discord', 'discord id', 'discordid', 'discord_id'], 6);
  return values.slice(1).map(row => ({
    badge: String(row[badge] ?? '').trim(),
    name: String(row[name] ?? '').trim(),
    rank: String(row[rank] ?? '').trim(),
    responsibility: String(row[responsibility] ?? '').trim(),
    discordId: id(row[discord])
  })).filter(x => x.discordId || x.name);
}

const traineeRanks = new Set(['مستجد', 'جندي', 'جندي أول', 'جنديأول'].map(norm));
const trainerRanks = new Set([
  'رقيب', 'رقيب أول', 'مساعد', 'مساعد أول', 'ملازم', 'ملازم أول', 'ملازم ثاني',
  'نقيب', 'رائد', 'مقدم', 'عقيد', 'عميد', 'لواء', 'فريق',
  'رئيس الأكاديمية', 'نائب رئيس الأكاديمية', 'مساعد نائب رئيس الأكاديمية',
  'قائد الشرطة', 'رئيس الشرطة', 'نائب رئيس الشرطة', 'مساعد قائد الشرطة'
].map(norm));
const isTrainee = row => traineeRanks.has(norm(row?.rank));
const isTrainer = row => trainerRanks.has(norm(row?.rank));

function evaluationBatch() {
  const selectedId = String(data.settings?.evaluationBatchId || '');
  if (!selectedId) return null;
  return (data.batches || []).find(b => String(b.id) === selectedId) || null;
}

function audit(actorId, action, target, details = '') {
  data.audit ||= [];
  data.audit.unshift({
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(), actorId: String(actorId), action, target, details
  });
  data.audit = data.audit.slice(0, 1000);
}

async function readImageRows(force = false) {
  if (!force && imageCacheAt && Date.now() - imageCacheAt < 30000) return imageCache;
  await ensureSheet(IMAGE_SHEET);
  const s = await service();
  const r = await s.spreadsheets.values.get({ spreadsheetId: DATA_SHEET_ID, range: `${IMAGE_SHEET}!A2:D` });
  const map = new Map();
  for (const row of (r.data.values || [])) {
    const userId = id(row[0]);
    if (!userId || !row[2]) continue;
    map.set(userId, { mime: String(row[1] || 'image/webp'), base64: String(row[2]), updatedAt: String(row[3] || '') });
  }
  imageCache = map;
  imageCacheAt = Date.now();
  return map;
}

async function writeImage(userId, dataUrl) {
  const match = String(dataUrl || '').match(/^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) throw new Error('INVALID_IMAGE_DATA');
  const mime = match[1].toLowerCase();
  const base64 = match[2];
  if (base64.length > 38000) throw new Error('IMAGE_TOO_LARGE');
  await ensureSheet(IMAGE_SHEET);
  const s = await service();
  const r = await s.spreadsheets.values.get({ spreadsheetId: DATA_SHEET_ID, range: `${IMAGE_SHEET}!A2:D` });
  const rows = r.data.values || [];
  const index = rows.findIndex(row => id(row[0]) === id(userId));
  const values = [[String(userId), mime, base64, new Date().toISOString()]];
  if (index >= 0) {
    const rowNumber = index + 2;
    await s.spreadsheets.values.update({ spreadsheetId: DATA_SHEET_ID, range: `${IMAGE_SHEET}!A${rowNumber}:D${rowNumber}`, valueInputOption: 'RAW', requestBody: { values } });
  } else {
    await s.spreadsheets.values.append({ spreadsheetId: DATA_SHEET_ID, range: `${IMAGE_SHEET}!A:D`, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', requestBody: { values } });
  }
  imageCache.delete(id(userId));
  imageCacheAt = 0;
}

async function deleteImage(userId) {
  await ensureSheet(IMAGE_SHEET);
  const s = await service();
  const r = await s.spreadsheets.values.get({ spreadsheetId: DATA_SHEET_ID, range: `${IMAGE_SHEET}!A2:D` });
  const rows = r.data.values || [];
  const index = rows.findIndex(row => id(row[0]) === id(userId));
  if (index < 0) return;
  const rowNumber = index + 2;
  await s.spreadsheets.values.update({ spreadsheetId: DATA_SHEET_ID, range: `${IMAGE_SHEET}!B${rowNumber}:D${rowNumber}`, valueInputOption: 'RAW', requestBody: { values: [['', '', '']] } });
  imageCache.delete(id(userId));
  imageCacheAt = 0;
}

register('get', '/api/kayan/evaluation-context', async (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  try {
    const rows = await policeRows();
    const me = rows.find(r => id(r.discordId) === userId) || null;
    if (!me) return res.status(403).json({ error: 'OFFICER_ONLY' });
    const role = isTrainer(me) ? 'trainer' : isTrainee(me) ? 'trainee' : 'none';
    const batch = evaluationBatch();
    res.json({
      role,
      me,
      batch: batch ? { id: batch.id, name: batch.name, startAt: batch.startAt || '', endAt: batch.endAt || '', status: batch.status || '' } : null,
      trainers: rows.filter(isTrainer).map(r => ({ name: r.name, rank: r.rank, badge: r.badge, discordId: r.discordId })),
      trainees: rows.filter(isTrainee).map(r => ({ name: r.name, rank: r.rank, badge: r.badge, discordId: r.discordId }))
    });
  } catch (e) {
    console.error('KAYAN_EVALUATION_CONTEXT_FAILED', e);
    res.status(503).json({ error: 'POLICE_SHEET_UNAVAILABLE' });
  }
});

register('post', '/api/kayan/evaluations', async (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  try {
    const rows = await policeRows();
    const me = rows.find(r => id(r.discordId) === userId) || null;
    if (!me) return res.status(403).json({ error: 'OFFICER_ONLY' });
    const role = isTrainer(me) ? 'trainer' : isTrainee(me) ? 'trainee' : 'none';
    if (role === 'none') return res.status(403).json({ error: 'EVALUATION_ROLE_UNDEFINED' });
    const batch = evaluationBatch();
    if (!batch) return res.status(409).json({ error: 'NO_ACTIVE_EVALUATION_BATCH' });
    const body = req.body || {};
    const trainer = role === 'trainer' ? me : rows.find(r => id(r.discordId) === id(body.trainerId));
    const trainee = role === 'trainee' ? me : rows.find(r => id(r.discordId) === id(body.traineeId));
    if (!trainer || !isTrainer(trainer)) return res.status(400).json({ error: 'INVALID_TRAINER' });
    if (!trainee || !isTrainee(trainee)) return res.status(400).json({ error: 'INVALID_TRAINEE' });
    if (role === 'trainer' && id(trainer.discordId) !== userId) return res.status(403).json({ error: 'TRAINER_ONLY_SELF' });
    if (role === 'trainee' && id(trainee.discordId) !== userId) return res.status(403).json({ error: 'TRAINEE_ONLY_SELF' });
    const type = role === 'trainer' ? 'trainer_to_trainee' : 'trainee_to_trainer';
    const requiredText = type === 'trainer_to_trainee'
      ? ['trainingHours', 'notes']
      : ['trainingHours', 'cases', 'trainerView', 'clarity', 'trainingNotes', 'trainerNotes', 'sameTrainer'];
    for (const key of requiredText) if (String(body[key] ?? '').trim() === '') return res.status(400).json({ error: 'REQUIRED_FIELD_MISSING', field: key });
    const ratings = type === 'trainer_to_trainee'
      ? ['leadershipRating', 'citizensRating', 'devicesRating', 'reportsRating', 'weaponsRating', 'rating']
      : ['rating'];
    for (const key of ratings) {
      const value = Number(body[key]);
      if (!Number.isInteger(value) || value < 1 || value > 10) return res.status(400).json({ error: 'INVALID_RATING', field: key });
    }
    const duplicate = (data.evaluations || []).find(e => e.batchId === batch.id && e.type === type && id(e.fromUserId) === userId && id(e.toUserId) === id(type === 'trainer_to_trainee' ? trainee.discordId : trainer.discordId));
    if (duplicate) return res.status(409).json({ error: 'EVALUATION_ALREADY_SUBMITTED' });
    const ev = {
      id: `eval-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      batchId: batch.id, batchName: batch.name, type,
      fromUserId: userId, fromName: me.name, fromRank: me.rank,
      trainerId: trainer.discordId, trainerName: trainer.name, trainerRank: trainer.rank, trainerBadge: trainer.badge,
      traineeId: trainee.discordId, traineeName: trainee.name, traineeRank: trainee.rank, traineeBadge: trainee.badge,
      trainingHours: String(body.trainingHours || ''),
      leadershipRating: String(body.leadershipRating || ''),
      citizensRating: String(body.citizensRating || ''),
      devicesRating: String(body.devicesRating || ''),
      reportsRating: String(body.reportsRating || ''),
      weaponsRating: String(body.weaponsRating || ''),
      cases: String(body.cases || ''), trainerView: String(body.trainerView || ''), clarity: String(body.clarity || ''),
      trainingNotes: String(body.trainingNotes || ''), trainerNotes: String(body.trainerNotes || ''), sameTrainer: String(body.sameTrainer || ''),
      notes: String(body.notes || ''), rating: Number(body.rating), reviewStatus: 'pending', createdAt: new Date().toISOString()
    };
    data.evaluations ||= [];
    data.evaluations.unshift(ev);
    audit(userId, 'CREATE_EVALUATION', ev.id, batch.name);
    await saveData();
    res.json({ ok: true, id: ev.id });
  } catch (e) {
    console.error('KAYAN_EVALUATION_CREATE_FAILED', e);
    res.status(503).json({ error: 'STORAGE_ERROR' });
  }
});

register('get', '/api/kayan/admin-evaluation-batch', (req, res) => {
  if (!requirePermission(req, res, 'manage_evaluations') && !can(req, 'manage_settings')) return;
  const batch = evaluationBatch();
  res.json({ selectedBatchId: data.settings?.evaluationBatchId || '', batch, batches: (data.batches || []).map(b => ({ id: b.id, name: b.name, startAt: b.startAt || '', endAt: b.endAt || '', status: b.status || '' })) });
});

register('put', '/api/kayan/admin-evaluation-batch', async (req, res) => {
  if (!requirePermission(req, res, 'manage_evaluations') && !can(req, 'manage_settings')) return;
  const batchId = String(req.body?.batchId || '');
  if (batchId && !(data.batches || []).some(b => String(b.id) === batchId)) return res.status(404).json({ error: 'BATCH_NOT_FOUND' });
  data.settings.evaluationBatchId = batchId;
  await saveData();
  res.json({ ok: true, selectedBatchId: batchId, batch: evaluationBatch() });
});

register('get', '/api/kayan/admins', (req, res) => {
  if (!requirePermission(req, res, 'manage_admins')) return;
  res.json({ permissions, admins: (data.admins || []).map(a => ({ discordId: String(a.discordId), name: a.name || '', permissions: Array.isArray(a.permissions) ? a.permissions : [], enabled: a.enabled !== false, source: a.source || (isSuperAdmin(a.discordId) ? 'environment' : 'system'), protected: isSuperAdmin(a.discordId) })) });
});

register('put', '/api/kayan/admins/:discordId', async (req, res) => {
  if (!requirePermission(req, res, 'manage_admins')) return;
  const target = id(req.params.discordId);
  if (!target) return res.status(400).json({ error: 'INVALID_DISCORD_ID' });
  const requested = Array.isArray(req.body?.permissions) ? req.body.permissions.filter(p => ALL.includes(p)) : [];
  if (isSuperAdmin(target) && (requested.length !== ALL.length || req.body?.enabled === false)) return res.status(400).json({ error: 'SUPER_ADMIN_PROTECTED' });
  const current = data.admins?.find(a => id(a.discordId) === target);
  const record = current || { discordId: target, createdAt: new Date().toISOString(), source: 'system' };
  record.name = String(req.body?.name ?? record.name ?? 'Admin').trim() || 'Admin';
  record.permissions = isSuperAdmin(target) ? [...ALL] : requested;
  record.enabled = isSuperAdmin(target) ? true : req.body?.enabled !== false;
  data.admins ||= [];
  if (!current) data.admins.push(record);
  audit(uid(req), 'UPSERT_ADMIN', target, record.permissions.join(','));
  await saveData();
  res.json({ ok: true, admin: { ...record, protected: isSuperAdmin(target) } });
});

register('delete', '/api/kayan/admins/:discordId', async (req, res) => {
  if (!requirePermission(req, res, 'manage_admins')) return;
  const target = id(req.params.discordId);
  if (!target) return res.status(400).json({ error: 'INVALID_DISCORD_ID' });
  if (isSuperAdmin(target)) return res.status(400).json({ error: 'SUPER_ADMIN_PROTECTED' });
  const index = (data.admins || []).findIndex(a => id(a.discordId) === target);
  if (index < 0) return res.status(404).json({ error: 'ADMIN_NOT_FOUND' });
  data.admins.splice(index, 1);
  audit(uid(req), 'DELETE_ADMIN', target);
  await saveData();
  res.json({ ok: true });
});

register('get', '/api/kayan/member-image/:discordId', async (req, res) => {
  const userId = id(req.params.discordId);
  if (!userId) return res.status(400).end();
  try {
    const map = await readImageRows();
    const item = map.get(userId);
    if (!item) return res.status(404).end();
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.type(item.mime).send(Buffer.from(item.base64, 'base64'));
  } catch (e) {
    console.error('KAYAN_MEMBER_IMAGE_READ_FAILED', e);
    res.status(503).end();
  }
});

register('put', '/api/kayan/member-image', async (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  try {
    const rows = await policeRows();
    if (!rows.some(r => id(r.discordId) === userId)) return res.status(403).json({ error: 'OFFICER_ONLY' });
    await writeImage(userId, req.body?.dataUrl);
    res.json({ ok: true, url: `/api/kayan/member-image/${userId}?v=${Date.now()}` });
  } catch (e) {
    const code = e.message === 'IMAGE_TOO_LARGE' ? 'IMAGE_TOO_LARGE' : e.message === 'INVALID_IMAGE_DATA' ? 'INVALID_IMAGE_DATA' : 'STORAGE_ERROR';
    res.status(code === 'STORAGE_ERROR' ? 503 : 400).json({ error: code });
  }
});

register('delete', '/api/kayan/member-image', async (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  try { await deleteImage(userId); res.json({ ok: true }); }
  catch { res.status(503).json({ error: 'STORAGE_ERROR' }); }
});

register('put', '/api/kayan/admin/member-image/:discordId', async (req, res) => {
  if (!requirePermission(req, res, 'manage_members')) return;
  const target = id(req.params.discordId);
  if (!target) return res.status(400).json({ error: 'INVALID_DISCORD_ID' });
  try { await writeImage(target, req.body?.dataUrl); res.json({ ok: true, url: `/api/kayan/member-image/${target}?v=${Date.now()}` }); }
  catch (e) { res.status(e.message === 'IMAGE_TOO_LARGE' || e.message === 'INVALID_IMAGE_DATA' ? 400 : 503).json({ error: e.message === 'IMAGE_TOO_LARGE' ? 'IMAGE_TOO_LARGE' : e.message === 'INVALID_IMAGE_DATA' ? 'INVALID_IMAGE_DATA' : 'STORAGE_ERROR' }); }
});

register('delete', '/api/kayan/admin/member-image/:discordId', async (req, res) => {
  if (!requirePermission(req, res, 'manage_members')) return;
  try { await deleteImage(id(req.params.discordId)); res.json({ ok: true }); }
  catch { res.status(503).json({ error: 'STORAGE_ERROR' }); }
});
