require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const DramaboxScraper = require('@zhadev/dramabox').default;

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ── PROXY SETUP ──────────────────────────────────────────────────────
// DramaBox nge-block IP datacenter (VPS/cloud biasa dapet 403 pas token gen).
// Solusinya: pake residential/mobile proxy. Set PROXY_URL di .env, contoh:
//   PROXY_URL=http://username:password@proxy-host:port
// Karena @zhadev/dramabox manggil axios.default.get/post/request langsung
// (bukan instance axios sendiri), setting axios.defaults di sini otomatis
// kepakai juga sama request-request di dalam library itu.
if (process.env.PROXY_URL) {
  const agent = new HttpsProxyAgent(process.env.PROXY_URL);
  axios.defaults.httpAgent = agent;
  axios.defaults.httpsAgent = agent;
  axios.defaults.proxy = false; // matiin proxy handling bawaan axios, pake agent manual
  console.log('[proxy] aktif, semua request lewat:', process.env.PROXY_URL.replace(/\/\/.*@/, '//<hidden>@'));
} else {
  console.log('[proxy] PROXY_URL ga di-set, request langsung tanpa proxy (rawan 403 kalau host di cloud/VPS)');
}

// Satu instance scraper dipakai bareng (biar cache & token kepakai ulang)
const scraper = new DramaboxScraper({
  language: 'in',
  cacheTTL: 300,      // cache 5 menit biar ga spam ke server dramabox
  requestDelay: 500,  // jeda dikit antar request internal
  maxRetries: 3,
});

// Helper: bungkus semua route biar error konsisten
const handle = (fn) => async (req, res) => {
  try {
    const result = await fn(req);
    res.json(result);
  } catch (err) {
    res.status(500).json({
      success: false,
      creator: 'aji-dramabox-api',
      message: err.message || 'Internal error',
    });
  }
};

// Root - info API
app.get('/', (req, res) => {
  res.json({
    success: true,
    name: 'DramaBox Unofficial API',
    creator: 'aji',
    endpoints: [
      'GET /latest?page=1',
      'GET /trending',
      'GET /vip',
      'GET /homepage',
      'GET /categories?page=1&pageSize=20',
      'GET /category/:typeTwoId?page=1&pageSize=20',
      'GET /recommended',
      'GET /search?q=keyword&page=1&pageSize=20',
      'GET /search/suggest?q=keyword',
      'GET /detail/:bookId',
      'GET /detail-v2/:bookId',
      'GET /chapters/:bookId',
      'GET /episode/:bookId/:episodeIndex',
      'GET /stream/:bookId/:episode',
      'GET /batch/:bookId',
      'GET /related/:bookId',
      'GET /health',
    ],
  });
});

app.get('/health', handle(async () => await scraper.ping()));

app.get('/proxy-status', (req, res) => {
  res.json({
    success: true,
    proxyActive: !!process.env.PROXY_URL,
    note: process.env.PROXY_URL
      ? 'Request diarahkan lewat proxy.'
      : 'Ga pake proxy — kalau host di VPS/cloud, request ke DramaBox bisa kena 403.',
  });
});

app.get('/latest', handle(async (req) => {
  const page = parseInt(req.query.page) || 1;
  return await scraper.getLatest(page);
}));

app.get('/trending', handle(async () => await scraper.getTrending()));

app.get('/vip', handle(async () => await scraper.getVip()));

app.get('/homepage', handle(async () => await scraper.getHomepage()));

app.get('/recommended', handle(async () => await scraper.getRecommendedBooks()));

app.get('/categories', handle(async (req) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 20;
  return await scraper.getCategories(page, pageSize);
}));

app.get('/category/:typeTwoId', handle(async (req) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 20;
  return await scraper.getBooksByCategory(req.params.typeTwoId, page, pageSize);
}));

app.get('/search', handle(async (req) => {
  const q = req.query.q || '';
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 20;
  if (!q) throw new Error('Query param "q" wajib diisi');
  return await scraper.searchDrama(q, page, pageSize);
}));

app.get('/search/suggest', handle(async (req) => {
  const q = req.query.q || '';
  if (!q) throw new Error('Query param "q" wajib diisi');
  return await scraper.suggestSearch(q);
}));

app.get('/detail/:bookId', handle(async (req) => await scraper.getDramaDetail(req.params.bookId)));

app.get('/detail-v2/:bookId', handle(async (req) => await scraper.getDramaDetailV2(req.params.bookId)));

app.get('/chapters/:bookId', handle(async (req) => await scraper.getChapters(req.params.bookId)));

app.get('/episode/:bookId/:episodeIndex', handle(async (req) => {
  return await scraper.getEpisodeDetails(req.params.bookId, parseInt(req.params.episodeIndex));
}));

app.get('/stream/:bookId/:episode', handle(async (req) => {
  return await scraper.getStreamUrl(req.params.bookId, parseInt(req.params.episode));
}));

app.get('/batch/:bookId', handle(async (req) => await scraper.batchDownload(req.params.bookId)));

app.get('/related/:bookId', handle(async (req) => await scraper.getRelatedDramas(req.params.bookId)));

app.listen(PORT, () => {
  console.log(`DramaBox API jalan di port ${PORT}`);
});
