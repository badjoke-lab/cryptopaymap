/* eslint-disable no-console */
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const sanitizeHtml = require('sanitize-html');
const { z } = require('zod');
require('dotenv').config();

/* ========== ENV / CONFIG ========== */
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const PORT = process.env.PORT || 3000;

const VERIFY_SECRET = process.env.VERIFY_SECRET || 'dev-secret';
const VERIFY_TTL_HOURS = +(process.env.VERIFY_TTL_HOURS || 24);

const IMG_MAX_MB = +(process.env.IMG_MAX_MB || 2);
const OWNER_MAX_IMAGES = +(process.env.OWNER_MAX_IMAGES || 8);
const COMMUNITY_MAX_IMAGES = +(process.env.COMMUNITY_MAX_IMAGES || 4);
const REPORT_MAX_IMAGES = +(process.env.REPORT_MAX_IMAGES || 4);

const RATE_PER_MIN = +(process.env.RATE_PER_MIN || 30);

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = +(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const OPS_EMAIL = process.env.OPS_EMAIL || 'ops@example.com';
const MAIL_FROM = process.env.MAIL_FROM || 'CryptoPayMap Forms <noreply@cryptopaymap.app>';

/* ========== PATHS ========== */
const PUBLIC_DIR = path.resolve(__dirname, 'public');
const MEDIA_DIR = path.join(PUBLIC_DIR, 'media');

const DATA_DIR = path.join(PUBLIC_DIR, 'data');
const SUBMISSIONS_DIR = (kind) => path.join(DATA_DIR, 'submissions', kind);
const LOG_DIR = path.join(DATA_DIR, 'logs', 'forms');
const VERIFY_DIR = path.join(DATA_DIR, 'verify');
const VERIFY_PENDING = path.join(VERIFY_DIR, 'pending');
const VERIFY_VERIFIED = path.join(VERIFY_DIR, 'verified');

[MEDIA_DIR, LOG_DIR, VERIFY_PENDING, VERIFY_VERIFIED,
 SUBMISSIONS_DIR('owner'), SUBMISSIONS_DIR('community'), SUBMISSIONS_DIR('report')
].forEach(d => fs.mkdirSync(d, { recursive: true }));

/* ========== CONSTANTS ========== */
const CATEGORIES = [
  "Cafe","Restaurant","Bar / Pub","Bakery","Grocery / Supermarket","Butcher",
  "Pharmacy","Clinic / Doctors","Dentist","Hairdresser / Barber","Spa / Beauty",
  "Electronics","Clothing / Apparel","Jewelry","Bookshop","Convenience store",
  "Hotel / Lodging","Gym / Fitness","Dance school / Studio","Tool / Equipment rental",
  "Coworking / Office","Other"
];

const ISSUE_TYPES = ["Closed","Wrong info","Duplicate","Fraud","Other"];

/* ========== UTILS ========== */
const nowISO = () => new Date().toISOString();

const ensureDir = (p) => fs.mkdirSync(p, { recursive: true });
const writeJson = (p, v) => { ensureDir(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n', 'utf8'); };
const readJson = (p, fallback=null) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; } };

const base64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const hmacB64 = (secret, msg) => base64url(crypto.createHmac('sha256', secret).update(msg).digest());

const slugify = (s='') =>
  s.toString().trim().toLowerCase()
   .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80) || 'place';

const splitList = (v) => {
  if (!v) return [];
  return String(v).split(/[\n,|]+/).map(x => x.trim()).filter(Boolean);
};

const sanitizeText = (s) => sanitizeHtml(String(s || ''), { allowedTags: [], allowedAttributes: {} }).trim();
const isUrl = (u) => /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(String(u || ''));
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || ''));
const isPhoneLite = (p) => /^\+?[0-9().\-\s]{7,25}$/.test(String(p || ''));

/* ===== coins: keep raw list (normalization is importer-side) ===== */
const normalizeCoinsRaw = (s) => {
  const items = splitList(s).map(x => x.replace(/\s+/g,' ').trim());
  const uniq = [...new Set(items)];
  return uniq.slice(0, 100);
};

/* ========== EMAIL ==========
   Plain summary to submitter + OPS. No JSON attachments.
================================ */
const transporter = nodemailer.createTransport({
  host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465,
  auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined
});

async function sendSummaryMail({kind, submitter, business, basics, lists, counts, verifyUrl}) {
  const toList = [submitter.email, OPS_EMAIL].filter(Boolean).join(', ');
  const subject = `New ${kind[0].toUpperCase() + kind.slice(1)} submission received`;
  let lines = [];
  lines.push(`Form: ${kind}`);
  lines.push(`Submitted at: ${nowISO()}`);
  lines.push(`Submitter: ${submitter.name} <${submitter.email}>`);
  lines.push('');
  lines.push(`Business: ${business.name}`);
  if (business.category) lines.push(`Category: ${business.category}`);
  lines.push(`Address: ${business.address}`);
  lines.push(`City/Country: ${business.city} / ${business.country}`);
  if (basics.website) lines.push(`Website/Map: ${basics.website}`);
  lines.push('');
  if (lists.coins && lists.coins.length) lines.push(`Accepted crypto (raw): ${lists.coins.join(', ')}`);
  if (kind === 'community' && lists.evidence && lists.evidence.length) {
    lines.push(`Evidence links: ${lists.evidence.length} item(s)`);
    lines = lines.concat(lists.evidence.slice(0,3).map((u,i)=>`  ${i+1}. ${u}`));
  }
  if (kind === 'report') {
    lines.push(`Issue type: ${basics.issueType}`);
    if (lists.evidence && lists.evidence.length) {
      lines.push(`Evidence links: ${lists.evidence.length} item(s)`);
      lines = lines.concat(lists.evidence.slice(0,3).map((u,i)=>`  ${i+1}. ${u}`));
    }
  }
  if (counts.images != null) lines.push(`Images uploaded: ${counts.images}`);
  if (verifyUrl) { lines.push(''); lines.push('Please verify the owner email:'); lines.push(verifyUrl); }
  const text = lines.join('\n');

  await transporter.sendMail({
    from: MAIL_FROM, to: toList, subject, text
  });
}

/* ========= MULTER (memory) ========= */
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(jpeg|png|webp)$/i.test(file.mimetype);
    if (!ok) return cb(new Error('Images only'));
    cb(null, true);
  },
  limits: { fileSize: IMG_MAX_MB * 1024 * 1024 } // per-file
});

/* ========= IMAGE PIPELINE ========= */
async function saveImageToMedia(fileBuf) {
  const hash = crypto.createHash('sha1').update(fileBuf).digest('hex').slice(0,16);
  const outPath = path.join(MEDIA_DIR, `${hash}.jpg`);
  if (!fs.existsSync(outPath)) {
    const out = await sharp(fileBuf)
      .rotate() // auto-orient
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
    fs.writeFileSync(outPath, out);
  }
  return { fileId: hash, url: `/media/${hash}.jpg` };
}

/* ========= ZOD SCHEMAS ========= */
const zSubmitter = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email()
});

const zOwner = z.object({
  submitter: zSubmitter,
  place: z.object({
    name: z.string().min(1).max(80),
    city: z.string().min(2).max(64),
    country: z.string().min(2).max(64),
    address: z.string().min(5).max(200),
    website: z.string().url().max(2048).optional().or(z.literal('').transform(()=>undefined)),
    category: z.enum(CATEGORIES),
    category_other: z.string().max(100).optional(),
    hours: z.string().max(200).optional(),
    phone: z.string().max(25).optional().refine(v=>!v || isPhoneLite(v), 'Invalid phone'),
    socials_raw: z.string().max(2000).optional()
  }),
  coins_raw: z.string().min(1).max(500),
  chains_hint: z.array(z.string()).optional(),
  proof: z.enum([
    'Domain verification (.well-known/meta)',
    'Official payment page URL',
    'Business email @domain',
    'POS/receipt photo (separate field)',
    'Other'
  ]),
  payment_pages_raw: z.string().max(2000).optional(),
  consent: z.literal('on')
});

const zCommunity = z.object({
  submitter: zSubmitter,
  place: z.object({
    name: z.string().min(1).max(80),
    city: z.string().min(2).max(64),
    country: z.string().min(2).max(64),
    address: z.string().min(5).max(200),
    website: z.string().url().max(2048).optional().or(z.literal('').transform(()=>undefined)),
    category: z.enum(CATEGORIES)
  }),
  coins_raw: z.string().min(1).max(500),
  evidence_raw: z.string().min(1), // split then count>=2 on server
  consent: z.literal('on')
});

const zReport = z.object({
  submitter: zSubmitter,
  place_ref: z.string().min(1).max(2048),
  place_name: z.string().max(80).optional(),
  issue_type: z.enum(ISSUE_TYPES),
  details: z.string().min(1).max(1000),
  evidence_raw: z.string().optional(),
  new_coins_raw: z.string().optional(),
  other_proposal: z.string().optional(),
  contact_email: z.string().email().optional(),
  consent: z.literal('on')
});

/* ========= helpers: social/evidence/payment pages parsing ========= */
function parseSocials(raw) {
  const arr = splitList(raw).slice(0, 50);
  const out = [];
  for (const s of arr) {
    if (s.startsWith('@')) out.push({ platform: null, handle: s, url: null });
    else if (isUrl(s)) out.push({ platform: null, handle: null, url: s });
  }
  return out;
}
function parseUrls(raw) {
  const arr = splitList(raw).slice(0, 50);
  return [...new Set(arr.filter(isUrl))];
}

/* ========= ref / token ========= */
function makeRef(kind) {
  const d = new Date();
  const yyyymmdd = d.toISOString().slice(0,10).replace(/-/g,'');
  const rnd = crypto.randomBytes(3).toString('hex');
  return `${kind.slice(0,3)}_${yyyymmdd}_${rnd}`;
}
function makeVerifyLink({ref, email}) {
  const tok = 'V1.' + base64url(crypto.randomBytes(16));
  const exp = Math.floor(Date.now()/1000) + VERIFY_TTL_HOURS*3600;
  const msg = `${tok}|${ref}|${email}|${exp}`;
  const sig = hmacB64(VERIFY_SECRET, msg);
  const url = `${BASE_URL}/verify-email?tok=${encodeURIComponent(tok)}&ref=${encodeURIComponent(ref)}&e=${encodeURIComponent(email)}&exp=${exp}&sig=${encodeURIComponent(sig)}`;
  return { tok, exp, url, sig };
}

/* ========= express app ========= */
const app = express();

/* static & parsers */
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/media', express.static(MEDIA_DIR, { maxAge: '365d', immutable: true }));
app.use(express.static(PUBLIC_DIR));

/* rate limit */
app.use('/submit', rateLimit({ windowMs: 60_000, max: RATE_PER_MIN, standardHeaders: true }));

/* ===== shared builder ===== */
function buildBaseJson(kind, place, submitter) {
  const slug = `${slugify(place.name)}-${Date.now()}`;
  return {
    meta: { source: 'self-form', kind, timestamp: nowISO(), slug, ref: makeRef(kind) },
    place: {
      name: place.name,
      address: place.address,
      city: place.city,
      country: place.country,
      lat: null, lng: null,
      category: place.category,
      category_other: place.category_other || null,
      website: place.website || null,
      phone: place.phone || null,
      hours: place.hours || null,
      socials: place.socials || []
    },
    submission: {
      submitter: { name: submitter.name, email: submitter.email },
      already_listed: false,
      listed_ref: null,
      coins_raw: [],
      chains_hint: []
    },
    verification: {},
    links: {},
    profile: { summary: null },
    consent: 'yes'
  };
}

/* ===== route: /submit/owner ===== */
app.post('/submit/owner',
  upload.fields([{ name: 'images', maxCount: OWNER_MAX_IMAGES * 3 }, { name: 'receipt', maxCount: 1 }]),
  async (req, res) => {
    try {
      // sanitize & shape body
      const body = {
        submitter: {
          name: sanitizeText(req.body['Submitter name']),
          email: sanitizeText(req.body['Submitter email'])
        },
        place: {
          name: sanitizeText(req.body['Business name']),
          city: sanitizeText(req.body['City']),
          country: sanitizeText(req.body['Country']),
          address: sanitizeText(req.body['Address']),
          website: sanitizeText(req.body['Website / Map URL']),
          category: req.body['Category'],
          category_other: sanitizeText(req.body['Category (Other)']),
          hours: sanitizeText(req.body['Opening hours']),
          phone: sanitizeText(req.body['Contact / Phone']),
          socials_raw: req.body['Social links'] || ''
        },
        coins_raw: req.body['Accepted crypto'] || '',
        chains_hint: splitList(req.body['Chain hint (optional)'] || ''),
        proof: req.body['Ownership proof (pick one)'],
        payment_pages_raw: req.body['Payment page / instructions URLs'] || '',
        consent: req.body['Consent']
      };

      const parsed = zOwner.safeParse(body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid form', issues: parsed.error.issues });
      }
      const v = parsed.data;

      /* business rules */
      // payment pages required when proof = Official payment page URL
      if (v.proof === 'Official payment page URL') {
        const pages = parseUrls(v.payment_pages_raw || '');
        if (pages.length < 1) {
          return res.status(400).json({ error: 'Invalid form', issues: [{ path: 'links.payment_pages', message: 'Provide at least one official payment page URL' }] });
        }
      }

      // files
      const filesImages = (req.files?.images || []);
      const filesReceipt = (req.files?.receipt || []);

      // enforce count & size
      if (filesImages.length > OWNER_MAX_IMAGES) {
        return res.status(413).json({ error: `Too many images (max ${OWNER_MAX_IMAGES})` });
      }
      for (const f of filesImages) {
        if (f.size > IMG_MAX_MB * 1024 * 1024) return res.status(413).json({ error: 'File exceeds 2MB limit' });
      }
      if (filesReceipt[0] && filesReceipt[0].size > IMG_MAX_MB * 1024 * 1024) {
        return res.status(413).json({ error: 'Receipt exceeds 2MB limit' });
      }

      // build json
      const socials = parseSocials(v.place.socials_raw || '');
      const json = buildBaseJson('owner', { ...v.place, socials }, v.submitter);
      json.submission.coins_raw = normalizeCoinsRaw(v.coins_raw);
      json.submission.chains_hint = v.chains_hint || [];
      json.verification.status = 'owner';
      json.verification.proof = v.proof;
      json.links.payment_pages = parseUrls(v.payment_pages_raw || []);

      // images
      json.submission.images = [];
      for (const f of filesImages.slice(0, OWNER_MAX_IMAGES)) {
        const saved = await saveImageToMedia(f.buffer);
        json.submission.images.push(saved);
      }
      if (filesReceipt[0]) {
        json.verification.receipt_image = await saveImageToMedia(filesReceipt[0].buffer);
      }

      // save
      const outPath = path.join(SUBMISSIONS_DIR('owner'), `${json.meta.slug}.owner.${Date.now()}.json`);
      writeJson(outPath, json);

      // optional verify link (Business email)
      let verifyUrl = null;
      if (v.proof === 'Business email @domain') {
        const { tok, exp, url } = makeVerifyLink({ ref: json.meta.ref, email: v.submitter.email });
        verifyUrl = url;
        // pending map
        writeJson(path.join(VERIFY_PENDING, `${tok}.json`), {
          ref: json.meta.ref,
          path: path.relative(PUBLIC_DIR, outPath),
          email: v.submitter.email,
          exp
        });
      }

      // mail
      await sendSummaryMail({
        kind: 'owner',
        submitter: v.submitter,
        business: { name: v.place.name, address: v.place.address, city: v.place.city, country: v.place.country, category: v.place.category },
        basics: { website: v.place.website },
        lists: { coins: json.submission.coins_raw, evidence: null },
        counts: { images: json.submission.images.length },
        verifyUrl
      });

      // redirect to /submitted
      return res.redirect(303, `/submitted/?ref=${encodeURIComponent(json.meta.ref)}&kind=owner`);

    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Server error' });
    }
  }
);

/* ===== route: /submit/community ===== */
app.post('/submit/community',
  upload.array('images', COMMUNITY_MAX_IMAGES * 3),
  async (req, res) => {
    try {
      const body = {
        submitter: {
          name: sanitizeText(req.body['Submitter name']),
          email: sanitizeText(req.body['Submitter email'])
        },
        place: {
          name: sanitizeText(req.body['Business name']),
          city: sanitizeText(req.body['City']),
          country: sanitizeText(req.body['Country']),
          address: sanitizeText(req.body['Address']),
          website: sanitizeText(req.body['Website / Map URL']),
          category: req.body['Category']
        },
        coins_raw: req.body['Accepted crypto'] || '',
        evidence_raw: req.body['Evidence link(s)'] || '',
        consent: req.body['Confirmation']
      };

      const parsed = zCommunity.safeParse(body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid form', issues: parsed.error.issues });
      }
      const v = parsed.data;

      const evidence = parseUrls(v.evidence_raw || '');
      if (evidence.length < 2) {
        return res.status(400).json({ error: 'Invalid form', issues: [{ path: 'links.evidence', message: 'Provide at least two evidence links (URLs)' }] });
      }

      const files = req.files || [];
      if (files.length > COMMUNITY_MAX_IMAGES) {
        return res.status(413).json({ error: `Too many images (max ${COMMUNITY_MAX_IMAGES})` });
      }
      for (const f of files) {
        if (f.size > IMG_MAX_MB * 1024 * 1024) return res.status(413).json({ error: 'File exceeds 2MB limit' });
      }

      const json = buildBaseJson('community', v.place, v.submitter);
      json.submission.coins_raw = normalizeCoinsRaw(v.coins_raw);
      json.verification.status = 'community';
      json.links.evidence = evidence;
      json.submission.images = [];
      for (const f of files.slice(0, COMMUNITY_MAX_IMAGES)) {
        const saved = await saveImageToMedia(f.buffer);
        json.submission.images.push(saved);
      }

      const outPath = path.join(SUBMISSIONS_DIR('community'), `${json.meta.slug}.community.${Date.now()}.json`);
      writeJson(outPath, json);

      await sendSummaryMail({
        kind: 'community',
        submitter: v.submitter,
        business: { name: v.place.name, address: v.place.address, city: v.place.city, country: v.place.country, category: v.place.category },
        basics: { website: v.place.website },
        lists: { coins: json.submission.coins_raw, evidence },
        counts: { images: json.submission.images.length },
        verifyUrl: null
      });

      return res.redirect(303, `/submitted/?ref=${encodeURIComponent(json.meta.ref)}&kind=community`);

    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Server error' });
    }
  }
);

/* ===== route: /submit/report ===== */
app.post('/submit/report',
  upload.array('images', REPORT_MAX_IMAGES * 3),
  async (req, res) => {
    try {
      const body = {
        submitter: {
          name: sanitizeText(req.body['Submitter name']),
          email: sanitizeText(req.body['Submitter email'])
        },
        place_ref: sanitizeText(req.body['Map URL or Place ID']),
        place_name: sanitizeText(req.body['Place name']),
        issue_type: req.body['Issue type'],
        details: sanitizeText(req.body['Description / Details']),
        evidence_raw: req.body['Evidence link(s)'] || '',
        new_coins_raw: req.body['New accepted crypto'] || '',
        other_proposal: req.body['Other proposal'] || '',
        contact_email: sanitizeText(req.body['Contact email (optional)']),
        consent: req.body['Consent']
      };

      const parsed = zReport.safeParse(body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid form', issues: parsed.error.issues });
      }
      const v = parsed.data;

      const files = req.files || [];
      if (files.length > REPORT_MAX_IMAGES) {
        return res.status(413).json({ error: `Too many images (max ${REPORT_MAX_IMAGES})` });
      }
      for (const f of files) {
        if (f.size > IMG_MAX_MB * 1024 * 1024) return res.status(413).json({ error: 'File exceeds 2MB limit' });
      }

      const evidence = parseUrls(v.evidence_raw || '');
      const newCoins = normalizeCoinsRaw(v.new_coins_raw || '');

      const base = {
        meta: { source: 'self-form', kind: 'report', timestamp: nowISO(), slug: `${slugify(v.place_name || 'report')}-${Date.now()}`, ref: makeRef('report') },
        place_ref: v.place_ref,
        report: {
          reason: v.issue_type,
          evidence_urls: evidence,
          notes: v.details,
          proposed: { coins: newCoins, other: v.other_proposal || null },
          images: [],
          consent: 'yes',
          contact: v.contact_email || null
        },
        submission: { submitter: v.submitter }
      };

      for (const f of files.slice(0, REPORT_MAX_IMAGES)) {
        const saved = await saveImageToMedia(f.buffer);
        base.report.images.push(saved);
      }

      const outPath = path.join(SUBMISSIONS_DIR('report'), `${base.meta.slug}.report.${Date.now()}.json`);
      writeJson(outPath, base);

      await sendSummaryMail({
        kind: 'report',
        submitter: v.submitter,
        business: { name: v.place_name || '(n/a)', address: '(n/a)', city: '(n/a)', country: '(n/a)' },
        basics: { website: null, issueType: v.issue_type },
        lists: { coins: newCoins, evidence },
        counts: { images: base.report.images.length },
        verifyUrl: null
      });

      return res.redirect(303, `/submitted/?ref=${encodeURIComponent(base.meta.ref)}&kind=report`);

    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Server error' });
    }
  }
);

/* ===== verify endpoint ===== */
app.get('/verify-email', (req, res) => {
  try {
    const tok = String(req.query.tok || '');
    const ref = String(req.query.ref || '');
    const e = String(req.query.e || '');
    const exp = parseInt(String(req.query.exp || '0'), 10);
    const sig = String(req.query.sig || '');

    if (!tok || !ref || !e || !exp || !sig) {
      return res.status(400).send('<h1>Invalid link</h1>');
    }
    if (Date.now()/1000 > exp) {
      return res.status(400).send('<h1>Link expired</h1>');
    }
    const expect = hmacB64(VERIFY_SECRET, `${tok}|${ref}|${e}|${exp}`);
    if (expect !== sig) {
      return res.status(400).send('<h1>Invalid signature</h1>');
    }

    const pendingPath = path.join(VERIFY_PENDING, `${tok}.json`);
    const pending = readJson(pendingPath);
    if (!pending || pending.ref !== ref || pending.email !== e) {
      return res.status(400).send('<h1>Token not found</h1>');
    }

    const abs = path.join(PUBLIC_DIR, pending.path);
    const json = readJson(abs);
    if (!json) return res.status(400).send('<h1>Submission not found</h1>');

    // append verification source if not already
    json.verification = json.verification || {};
    json.verification.sources = json.verification.sources || [];
    const already = json.verification.sources.some(s => s && s.type === 'email_domain_verified' && s.name === e);
    if (!already) {
      json.verification.sources.push({ type: 'email_domain_verified', name: e, when: nowISO() });
      writeJson(abs, json);
    }

    // move to verified
    fs.renameSync(pendingPath, path.join(VERIFY_VERIFIED, path.basename(pendingPath)));

    res.status(200).send('<h1>Owner email verified ✅</h1><p>Thanks for confirming your email. You can close this page.</p>');
  } catch (e) {
    console.error(e);
    res.status(500).send('<h1>Server error</h1>');
  }
});

/* ===== submitted landing (static index.html handles UI) ===== */
// handled by static /public

/* ===== start ===== */
app.listen(PORT, () => {
  console.log(`[forms] listening on ${BASE_URL} (PORT=${PORT})`);
});
