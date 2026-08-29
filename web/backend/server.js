const express = require('express');

const cors = require('cors');

const axios = require('axios');

const cheerio = require('cheerio');

require('dotenv').config();



const app = express();

const PORT = process.env.PORT || 3001;



app.use(cors());

app.use(express.json());



// ─────────────────────────────────────────────

// Provider definitions

// Player 1 → VixSrc

// Player 2 → VidSrc (con fallback automatico tra domini mirror)

// ─────────────────────────────────────────────



function buildVixSrcUrl(tmdbId, type, season, episode) {

  if (type === 'movie') {

    return `https://vixsrc.to/movie/${tmdbId}`;

  }

  return `https://vixsrc.to/tv/${tmdbId}/${season}/${episode}`;

}



// Costruisce URL con la versione query-param di VidSrc

// Documentazione: https://vidsrc-embed.ru/api/

// Parametri supportati:

//   tmdb     → ID TMDB (richiesto)

//   season   → numero stagione (serie TV)

//   episode  → numero episodio (serie TV)

//   ds_lang  → lingua default dei sottotitoli (ISO 639, es. "it", "en")

//   autoplay → 1 o 0

//   autonext → 1 o 0 (passa automaticamente al prossimo episodio)

function buildVidSrcUrl(domain, tmdbId, type, season, episode) {

  const params = new URLSearchParams();

  params.set('tmdb', String(tmdbId));



  if (type === 'tv') {

    params.set('season', String(season));

    params.set('episode', String(episode));

  }




  // Autoplay attivato

  params.set('autoplay', '1');

  // Autonext attivato per serie TV

  if (type === 'tv') {

    params.set('autonext', '1');

  }



  return `https://${domain}/embed/${type}?${params.toString()}`;

}

// ── VidSrc: un solo player con fallback automatico tra i domini mirror ──

const VIDSRC_DOMAINS = [
  'vidsrc-embed.ru',
  'vidsrc-embed.su',
  'vidsrcme.su',
  'vsrc.su',
];

const VIDSRC_CACHE_TTL = 5 * 60 * 1000; // 5 minuti
let vidsrcCache = { domain: null, ts: 0 };

async function isReachable(url) {
  try {
    await axios.get(url, {
      timeout: 5000,
      maxRedirects: 3,
      validateStatus: (s) => s >= 200 && s < 400,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    return true;
  } catch {
    return false;
  }
}

async function resolveVidSrcUrl(tmdbId, type, season, episode) {
  const now = Date.now();
  const ordered =
    vidsrcCache.domain && now - vidsrcCache.ts < VIDSRC_CACHE_TTL
      ? [vidsrcCache.domain, ...VIDSRC_DOMAINS.filter((d) => d !== vidsrcCache.domain)]
      : VIDSRC_DOMAINS;

  for (const domain of ordered) {
    const url = buildVidSrcUrl(domain, tmdbId, type, season, episode);
    if (await isReachable(url)) {
      vidsrcCache = { domain, ts: now };
      return url;
    }
  }
  return buildVidSrcUrl(VIDSRC_DOMAINS[0], tmdbId, type, season, episode);
}



// Builder generico per player con schema path (/movie/{id}, /tv/{id}/{s}/{e})
function buildPathUrl(base, tmdbId, type, season, episode) {
  if (type === 'movie') {
    return `${base}/movie/${tmdbId}`;
  }
  return `${base}/tv/${tmdbId}/${season}/${episode}`;
}

const players = {

  player1: {

    name: 'Player 1 (VixSrc)',

    buildUrl: (tmdbId, type, season, episode) =>

      buildVixSrcUrl(tmdbId, type, season, episode)

  },

  player2: {
    name: 'Player 2 (VidSrc)',
    buildUrl: (tmdbId, type, season, episode) =>
      buildVidSrcUrl(VIDSRC_DOMAINS[0], tmdbId, type, season, episode),
    resolve: (tmdbId, type, season, episode) =>
      resolveVidSrcUrl(tmdbId, type, season, episode)
  },

  player6: {
    name: 'Player 6 (Videasy)',
    buildUrl: (tmdbId, type, season, episode) =>
      buildPathUrl('https://player.videasy.net', tmdbId, type, season, episode)
  },

  player7: {
    name: 'Player 7 (Vidlink)',
    buildUrl: (tmdbId, type, season, episode) =>
      buildPathUrl('https://vidlink.pro', tmdbId, type, season, episode)
  },

};



// ─────────────────────────────────────────────

// M3U8 Stream Extraction

// Reverse engineering dell'API VidSrc

// ─────────────────────────────────────────────

async function extractM3U8FromVidSrc(embedUrl, tmdbId, type, season, episode) {

  try {

    console.log(`   🔍 Tentativo estrazione M3U8...`);



    // VidSrc usa un'API interna per ottenere gli stream

    // Pattern: https://vidsrc-embed.ru/api/source/{mediaId}

   

    // Step 1: Prova con l'API diretta di VidSrc

    const apiUrls = [

      // API v1 (più comune)

      `https://vidsrc-embed.ru/api/source/${tmdbId}`,

      // API v2 con parametri

      type === 'tv'

        ? `https://vidsrc-embed.ru/api/source/${tmdbId}/${season}/${episode}`

        : `https://vidsrc-embed.ru/api/source/${tmdbId}`,

    ];



    for (const apiUrl of apiUrls) {

      try {

        console.log(`   📡 Tentativo API: ${apiUrl}`);

        const response = await axios.get(apiUrl, {

          headers: {

            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',

            'Referer': embedUrl,

            'Origin': 'https://vidsrc-embed.ru'

          },

          timeout: 10000

        });



        if (response.data) {

          // Cerca l'M3U8 nella risposta

          const data = typeof response.data === 'string'

            ? response.data

            : JSON.stringify(response.data);

         

          const m3u8Match = data.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/i);

          if (m3u8Match) {

            console.log(`   ✅ M3U8 trovato via API: ${m3u8Match[0]}`);

            return m3u8Match[0];

          }



          // Se la risposta è JSON con struttura specifica

          if (response.data.sources && Array.isArray(response.data.sources)) {

            const hlsSource = response.data.sources.find(s =>

              s.file && s.file.includes('.m3u8')

            );

            if (hlsSource) {

              console.log(`   ✅ M3U8 trovato in sources: ${hlsSource.file}`);

              return hlsSource.file;

            }

          }



          // Cerca proprietà comuni

          if (response.data.file || response.data.url || response.data.stream) {

            const url = response.data.file || response.data.url || response.data.stream;

            if (typeof url === 'string' && url.includes('.m3u8')) {

              console.log(`   ✅ M3U8 trovato: ${url}`);

              return url;

            }

          }

        }

      } catch (apiError) {

        console.log(`   ⚠️  API fallita: ${apiError.message}`);

        continue;

      }

    }



    // Step 2: Fallback - scraping dell'HTML

    console.log(`   🔄 Fallback: scraping HTML...`);

    const response = await axios.get(embedUrl, {

      headers: {

        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

      },

      timeout: 10000

    });



    const html = response.data;

    const m3u8Patterns = [

      /https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/gi,

      /"file":\s*"([^"]+\.m3u8[^"]*)"/i,

      /'file':\s*'([^']+\.m3u8[^']*)'/i,

    ];



    for (const pattern of m3u8Patterns) {

      const match = html.match(pattern);

      if (match) {

        const url = (match[1] || match[0]).replace(/\\/g, '');

        console.log(`   ✅ M3U8 trovato in HTML: ${url}`);

        return url;

      }

    }



    console.log(`   ❌ M3U8 non trovato`);

    return null;



  } catch (error) {

    console.error(`   ❌ Errore estrazione: ${error.message}`);

    return null;

  }

}



// ─────────────────────────────────────────────

// Health check

// ─────────────────────────────────────────────

app.get('/api/health', (req, res) => {

  res.json({ status: 'ok', timestamp: new Date().toISOString() });

});



// ─────────────────────────────────────────────

// POST /api/stream

// Body: { tmdbId, type, playerId, season?, episode? }

// ─────────────────────────────────────────────

app.post('/api/stream', async (req, res) => {

  try {

    const { tmdbId, type, playerId, season, episode } = req.body;



    // ── Validazioni ──

    if (!tmdbId || !type) {

      return res.status(400).json({

        error: 'Parametri mancanti: tmdbId e type sono obbligatori'

      });

    }



    if (!['movie', 'tv'].includes(type)) {

      return res.status(400).json({

        error: 'type non valido. Deve essere "movie" o "tv"'

      });

    }



    if (type === 'tv') {

      if (!season || !episode || season < 1 || episode < 1) {

        return res.status(400).json({

          error: 'Serie TV: season e episode sono obbligatori e devono essere > 0',

          received: { season, episode }

        });

      }

    }



    // Default player2 se non specificato

    const selectedPlayer = playerId || 'player2';

    const player = players[selectedPlayer] || players.player2;



    // Costruisce l'URL (con fallback fra domini se il player lo prevede).

    let embedUrl;
    if (player.resolve) {
      embedUrl = await player.resolve(tmdbId, type, season, episode);
    } else {
      embedUrl = player.buildUrl(tmdbId, type, season, episode);
    }



    // Log

    console.log(`\n📺 Stream Request [${type.toUpperCase()}]`);



    // Log

    console.log(`\n📺 Stream Request [${type.toUpperCase()}]`);

    console.log(`   Player:  ${player.name}`);

    console.log(`   TMDB ID: ${tmdbId}`);

    if (type === 'tv') console.log(`   S${season}E${episode}`);

    console.log(`   🔗 URL:  ${embedUrl}\n`);



    res.json({

      success: true,

      source: {

        player: player.name,

        url: embedUrl,

        type,

        ...(type === 'tv' && { season, episode })

      }

    });



  } catch (error) {

    console.error('❌ Errore:', error);

    res.status(500).json({

      error: 'Internal server error',

      message: error.message

    });

  }

});



// ─────────────────────────────────────────────

// POST /api/extract-stream

// Estrae l'M3U8 diretto per il player proprietario

// Body: { tmdbId, type, playerId, season?, episode? }

// ─────────────────────────────────────────────

app.post('/api/extract-stream', async (req, res) => {

  try {

    const { tmdbId, type, playerId, season, episode } = req.body;



    // ── Validazioni (stesse del /api/stream) ──

    if (!tmdbId || !type) {

      return res.status(400).json({

        error: 'Parametri mancanti: tmdbId e type sono obbligatori'

      });

    }



    if (!['movie', 'tv'].includes(type)) {

      return res.status(400).json({

        error: 'type non valido. Deve essere "movie" o "tv"'

      });

    }



    if (type === 'tv') {

      if (!season || !episode || season < 1 || episode < 1) {

        return res.status(400).json({

          error: 'Serie TV: season e episode sono obbligatori e devono essere > 0',

          received: { season, episode }

        });

      }

    }



    // Default player2 se non specificato

    const selectedPlayer = playerId || 'player2';

    const player = players[selectedPlayer] || players.player2;



    // Costruisce l'URL embed

    const embedUrl = player.buildUrl(tmdbId, type, season, episode);



    // Log

    console.log(`\n🎬 Extract Stream Request [${type.toUpperCase()}]`);

    console.log(`   Player:  ${player.name}`);

    console.log(`   TMDB ID: ${tmdbId}`);

    if (type === 'tv') console.log(`   S${season}E${episode}`);

    console.log(`   🔗 Embed: ${embedUrl}`);



    // Estrae l'M3U8

    const m3u8Url = await extractM3U8FromVidSrc(embedUrl, tmdbId, type, season, episode);



    if (!m3u8Url) {

      return res.status(404).json({

        success: false,

        error: 'Stream non trovato',

        message: 'Impossibile estrarre il link video. Prova un altro player.',

        embedUrl  // Fallback: usa l'embed

      });

    }



    console.log(`   ✅ Stream estratto con successo\n`);



    res.json({

      success: true,

      source: {

        player: player.name,

        streamUrl: m3u8Url,  // URL M3U8 diretto

        embedUrl,            // Fallback

        type,

        ...(type === 'tv' && { season, episode })

      }

    });



  } catch (error) {

    console.error('❌ Errore:', error);

    res.status(500).json({

      success: false,

      error: 'Internal server error',

      message: error.message

    });

  }

});



// ─────────────────────────────────────────────

// Start

// ─────────────────────────────────────────────

app.listen(PORT, () => {

  console.log(`\n🚀 Backend API → http://localhost:${PORT}`);

  console.log(`   Health:        GET  /api/health`);

  console.log(`   Stream (embed): POST /api/stream`);

  console.log(`   Stream (M3U8):  POST /api/extract-stream`);

  console.log(`\n📋 Player disponibili:`);

  console.log(`   Player 1 → VixSrc (italiano)`);

  console.log(`   Player 2 → VidSrc (fallback: ${VIDSRC_DOMAINS.join(', ')})`);
  console.log(`   Player 6 → player.videasy.net`);
  console.log(`   Player 7 → vidlink.pro`);
  console.log('');

});