// ============================================================
// CONFIGURAZIONE — Cruscotto Festunità Novembre 2026
// Se cambia un foglio, un range o una data, si modifica SOLO questo blocco.
// ============================================================

const ANNO = 2026;

const FESTE = [
  {
    id: "sagra",
    nome: "Sagra del Pesce",
    breve: "Pesce",            // testo della pillola in alto
    sheetId: "1S2V-phi6VoW5EW7-2blqKAm0J2pZHm8WKO8VWMVQyvs",
    date: "6-7-8 e 13-14-15 novembre",
    giorni: ["06/11", "07/11", "08/11", "13/11", "14/11", "15/11"],
    // Divisione in weekend (solo Sagra). I giorni senza data riconoscibile
    // vengono assegnati in ordine: i primi 3 al 1° weekend, gli altri al 2°.
    weekend: [
      { nome: "1° weekend", giorni: ["06/11", "07/11", "08/11"] },
      { nome: "2° weekend", giorni: ["13/11", "14/11", "15/11"] },
    ],
    rangeAndamento: "B1:E80", // la tabella DATA/COPERTI/€ PASTO/INCASSO viene trovata da sola
  },
  {
    id: "piemontese",
    nome: "Piemontese",
    breve: "Piemontese",
    sheetId: "1BIc3mLr97D6etvreEgDySPmieKZvYE6jN5b7MnhKnSM",
    date: "21-22 novembre",
    giorni: ["21/11", "22/11"],
    rangeAndamento: "B1:E80",
  },
  {
    id: "toscano",
    nome: "Toscano",
    breve: "Toscano",
    sheetId: "1C-cr80QGoKzzMpY2DykX9FcDQ-YjRIPWp6Zdw9wLs28",
    date: "27-28-29 novembre",
    giorni: ["27/11", "28/11", "29/11"],
    rangeAndamento: "B1:E80",
  },
];

// Nomi dei tab (si leggono per NOME, non per gid). Il tab "Scontrini" non si usa.
const TAB_STATISTICHE = "Statistiche CUCINA";
const TAB_SPESE = "Registro spese";

// Piatti e bibite: riquadro ampio, la tabella si trova da sola
// (parte da "DESCRIZIONE", si ferma a "Totale generale", bibite dopo "DETTAGLIO BIBITE").
const RANGE_CLASSIFICHE = "M1:Q60";
// Registro spese: elenco fatture A:J (riquadro largo, le righe vuote vengono saltate).
const RANGE_SPESE = "A1:J400";

// Colonne del Registro spese (A=0 ... J=9). Usate se l'intestazione non viene letta.
const COLONNE_SPESE = {
  beneficiario: 0,  // A  BENEFICIARIO
  rimborsoA: 1,     // B  DA RIMBORSARE A
  descrizione: 2,   // C  DESCRIZIONE
  data: 3,          // D  DATA
  doc: 4,           // E  DOC. NR
  importo: 5,       // F  IMPORTO
  centro: 6,        // G  CENTRO DI COSTO
  categoria: 7,     // H  CATEGORIA
  metodo: 8,        // I  METODO DI PAGAMENTO
  dataPagamento: 9, // J  DATA PAGAMENTO
};

const CATEGORIE = [
  "ALIMENTARI",
  "BIBITE",
  "AFFITTI / ALLESTIMENTO",
  "PREMI LOTTERIA",
  "PUBBLICITA'",
  "PERSONALE",
  "SPESE VARIE (TOVAGLIE / ACCESSORI)",
  "UTENZE - ASSICURAZIONI - SPETTACOLI",
  "RIMBORSI SPESE (BENZA & CO)",
];
const CATEGORIA_ALTRO = "SENZA CATEGORIA / ALTRO";

// Ogni quanti secondi ricontrollare i dati
const REFRESH_SECONDS = 60;

// ============================================================
// LETTURA DATI — gviz CSV
// ============================================================

function gvizUrl(sheetId, sheetName, range) {
  const params = new URLSearchParams({
    tqx: "out:csv",
    sheet: sheetName,
    range: range,
    headers: "0", // niente "righe intestazione" indovinate da Google: arriva tutto come dati
    _cb: Date.now().toString(),
  });
  // spazi come %20 (non "+"), identico all'URL che si prova a mano nel browser
  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?${params.toString().replace(/\+/g, "%20")}`;
}

function parseCsv(text) {
  const rows = [];
  let cur = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { cur.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        cur.push(field); field = "";
        rows.push(cur);
        cur = [];
      } else { field += c; }
    }
  }
  if (field !== "" || cur.length) { cur.push(field); rows.push(cur); }
  return rows;
}

async function fetchCsv(url) {
  let res;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch (err) {
    throw new Error("errore di rete (" + err.message + "). Di solito: foglio non condiviso con \"chiunque abbia il link\", oppure connessione assente");
  }
  if (!res.ok) throw new Error("errore HTTP " + res.status);
  const text = await res.text();
  if (/^\s*<(!doctype|html)/i.test(text)) {
    throw new Error("Google ha risposto con una pagina web: foglio non condiviso con \"chiunque abbia il link\" o nome tab sbagliato");
  }
  return parseCsv(text);
}

// ============================================================
// NUMERI E DATE
// ============================================================

/** "€ 1.234,56" / "1234,5" / "12.5" / "#DIV/0!" / "" -> Number (0 se vuoto o errore) */
function num(raw) {
  if (raw == null) return 0;
  let s = String(raw).trim();
  if (s === "" || s === "-" || s.startsWith("#")) return 0;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[€\s ]/g, "");
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); }
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ""); // 1.234 = milleduecentotrentaquattro
  }
  const n = parseFloat(s);
  if (!isFinite(n)) return 0;
  return neg ? -n : n;
}

function isErrorCell(raw) {
  return /^#(N\/A|REF!|DIV\/0!|VALUE!|NAME\?|NUM!|ERROR!|NULL!)/i.test(String(raw || "").trim());
}

const MESI = { gen: 1, feb: 2, mar: 3, apr: 4, mag: 5, giu: 6, lug: 7, ago: 8, set: 9, ott: 10, nov: 11, dic: 12 };

/** Estrae "dd/mm" da etichette tipo "06/11", "6/11/2026", "2026-11-06", "ven 6 nov", "Date(2026,10,6)" */
function dateKeyFrom(label) {
  const s = String(label || "").trim().toLowerCase();
  if (!s) return null;
  let m = s.match(/date\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2})/);
  if (m) return pad(m[3]) + "/" + pad(parseInt(m[2], 10) + 1);
  m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return pad(m[3]) + "/" + pad(m[2]);
  m = s.match(/(\d{1,2})\s*[\/.\-]\s*(\d{1,2})/);
  if (m && parseInt(m[2], 10) <= 12) return pad(m[1]) + "/" + pad(m[2]);
  m = s.match(/(\d{1,2})\s+([a-z]{3})/);
  if (m && MESI[m[2]]) return pad(m[1]) + "/" + pad(MESI[m[2]]);
  return null;
}
function pad(n) { return String(n).padStart(2, "0"); }

function dateFromKey(key) {
  const m = (key || "").match(/^(\d{2})\/(\d{2})$/);
  if (!m) return null;
  return new Date(ANNO, parseInt(m[2], 10) - 1, parseInt(m[1], 10));
}

/** "06/11" -> "ven 6/11" */
function labelFromKey(key) {
  const d = dateFromKey(key);
  if (!d) return key;
  const wd = d.toLocaleDateString("it-IT", { weekday: "short" }).replace(".", "");
  return wd + " " + d.getDate() + "/" + (d.getMonth() + 1);
}

function todayKey() {
  const d = new Date();
  return pad(d.getDate()) + "/" + pad(d.getMonth() + 1);
}

function normKey(s) {
  return String(s || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

// ============================================================
// PARSER — Andamento (DATA | COPERTI | €/PASTO | INCASSO)
// Salta intestazione, TOTALE e righe vuote. I totali li ricalcola l'app.
// ============================================================

/**
 * Trova da sola la tabella "DATA | COPERTI | €/PASTO | INCASSO" dentro il riquadro letto:
 * parte dalla riga con "DATA" in colonna B e si ferma alla riga TOTALE.
 * Così non importa in quale riga del foglio si trova.
 */
function trovaTabellaAndamento(rows) {
  const start = rows.findIndex((r) => String(r[0] || "").trim().toUpperCase() === "DATA");
  if (start === -1) return rows.length <= 12 ? rows : []; // riquadro stretto: usa tutto
  const out = [];
  for (let i = start + 1; i < rows.length; i++) {
    if (/TOTAL/i.test(String(rows[i][0] || ""))) break;
    out.push(rows[i]);
  }
  return out;
}

function parseAndamento(rowsRiquadro, festa) {
  const rows = trovaTabellaAndamento(rowsRiquadro);
  const out = [];
  rows.forEach((r, i) => {
    const label = String(r[0] || "").trim();
    const up = label.toUpperCase();
    if (/TOTAL/.test(up)) return;                                   // riga TOTALE
    if (/^DATA\b/.test(up) || /COPERTI|INCASSO/.test((String(r[1] || "") + " " + String(r[3] || "")).toUpperCase())) return; // intestazione
    const coperti = Math.round(num(r[1]));
    const incasso = num(r[3]);
    if (!coperti && !incasso) return;                               // riga vuota o giorno futuro
    out.push({ rigaFoglio: i, label, dateKey: dateKeyFrom(label), coperti, incasso });
  });

  // Se Google ha "perso" la scritta TOTALE (colonna di date), la riga totale arriva
  // senza etichetta: la riconosciamo perché è uguale alla somma delle altre righe.
  const senzaEtichetta = out.filter((r) => !r.label);
  senzaEtichetta.forEach((t) => {
    const altre = out.filter((r) => r !== t && r.label);
    const sc = altre.reduce((s, r) => s + r.coperti, 0);
    const si = altre.reduce((s, r) => s + r.incasso, 0);
    if (altre.length && Math.abs(sc - t.coperti) < 0.5 && Math.abs(si - t.incasso) < 0.05) {
      t.scarta = true;
    }
  });
  const pulite = out.filter((r) => !r.scarta);

  // Stessa data su due righe (es. pranzo + cena): si sommano
  const giorni = [];
  const perData = new Map();
  pulite.forEach((r) => {
    if (r.dateKey && perData.has(r.dateKey)) {
      const g = perData.get(r.dateKey);
      g.coperti += r.coperti;
      g.incasso += r.incasso;
      g.turni += 1;
      return;
    }
    const g = {
      dateKey: r.dateKey,
      label: r.dateKey ? labelFromKey(r.dateKey) : r.label || "riga " + (r.rigaFoglio + 1),
      coperti: r.coperti,
      incasso: r.incasso,
      turni: 1,
    };
    giorni.push(g);
    if (r.dateKey) perData.set(r.dateKey, g);
  });

  // Divisione in weekend (solo se la festa li prevede)
  if (festa.weekend) {
    giorni.forEach((g, i) => {
      let w = festa.weekend.findIndex((wk) => g.dateKey && wk.giorni.includes(g.dateKey));
      if (w === -1) w = i < festa.weekend[0].giorni.length ? 0 : 1;
      g.weekend = w;
    });
  }

  return { giorni, totale: sommaGiorni(giorni) };
}

function sommaGiorni(giorni) {
  const coperti = giorni.reduce((s, g) => s + g.coperti, 0);
  const incasso = giorni.reduce((s, g) => s + g.incasso, 0);
  return { coperti, incasso, medio: coperti > 0 ? incasso / coperti : 0, giorni: giorni.length };
}

// ============================================================
// PARSER — Piatti e Bibite (M1:Q60)
// Colonne del riquadro: 0=M descrizione, 1=N pezzi, 2=O, 3=P descrizione, 4=Q euro
// ============================================================

function parseClassifiche(rows) {
  const res = {
    piatti: { nr: leggiBlocco(rows, 0, 1, "piatti"), euro: leggiBlocco(rows, 3, 4, "piatti") },
    bibite: { nr: leggiBlocco(rows, 0, 1, "bibite"), euro: leggiBlocco(rows, 3, 4, "bibite") },
  };
  return res;
}

/**
 * Legge una coppia di colonne (nome, valore). Il 1° blocco "DESCRIZIONE ... Totale generale"
 * sono i piatti; il blocco dopo "DETTAGLIO BIBITE" (o il 2° blocco) sono le bibite.
 */
function leggiBlocco(rows, colNome, colVal, sezioneVoluta) {
  let sezione = "piatti";
  let blocchiPiattiChiusi = 0;
  let leggo = false;
  const voci = new Map();

  for (const r of rows) {
    const testoRiga = r.map((c) => String(c || "").toUpperCase()).join(" | ");
    if (testoRiga.includes("DETTAGLIO BIBITE")) { sezione = "bibite"; leggo = false; continue; }

    const nome = String(r[colNome] || "").trim();
    const up = nome.toUpperCase();

    if (r.some((c) => String(c || "").trim().toUpperCase() === "DESCRIZIONE")) {
      if (sezione === "piatti" && blocchiPiattiChiusi > 0) sezione = "bibite";
      leggo = true;
      continue;
    }
    if (/^TOTALE\s*GENERALE/.test(up)) {
      if (leggo && sezione === "piatti") blocchiPiattiChiusi++;
      leggo = false;
      continue;
    }
    if (!leggo || sezione !== sezioneVoluta) continue;
    if (!nome || isErrorCell(nome) || /^(TOTALE|NR\.?|€|EURO)$/i.test(nome)) continue;

    const v = num(r[colVal]);
    if (v <= 0) continue;
    voci.set(nome, (voci.get(nome) || 0) + v);
  }

  return [...voci.entries()]
    .map(([nome, valore]) => ({ nome, valore }))
    .sort((a, b) => b.valore - a.valore);
}

// ============================================================
// PARSER — Registro spese (A:J)
// Il riepilogo per categoria si ricalcola dalle fatture.
// ============================================================

function parseSpese(rows) {
  const col = { ...COLONNE_SPESE };
  let start = 0;
  const idxIntest = rows.findIndex((r) => {
    const c = r.map((x) => normKey(x));
    return c.includes("BENEFICIARIO") || c.includes("CATEGORIA");
  });
  if (idxIntest !== -1) {
    start = idxIntest + 1;
    // Se l'intestazione c'è, usa la posizione reale delle colonne
    const intest = rows[idxIntest].map((x) => normKey(x));
    const nomi = {
      beneficiario: "BENEFICIARIO", rimborsoA: "DARIMBORSAREA", descrizione: "DESCRIZIONE",
      data: "DATA", doc: "DOCNR", importo: "IMPORTO", centro: "CENTRODICOSTO",
      categoria: "CATEGORIA", metodo: "METODODIPAGAMENTO", dataPagamento: "DATAPAGAMENTO",
    };
    Object.entries(nomi).forEach(([k, n]) => {
      const i = intest.indexOf(n);
      if (i !== -1) col[k] = i;
    });
  }

  const fatture = [];
  let righeConErrore = 0;
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    const cella = (k) => {
      const v = String(r[col[k]] || "").trim();
      return isErrorCell(v) ? "" : v;
    };
    const primo = cella("beneficiario").toUpperCase();
    if (/^(TOTALE|RIEPILOGO)/.test(primo)) break; // fine elenco
    const importo = num(r[col.importo]);
    if (!importo) {
      if (isErrorCell(r[col.importo]) && (cella("beneficiario") || cella("descrizione"))) righeConErrore++;
      continue;
    }
    if (!cella("beneficiario") && !cella("descrizione")) continue;
    const dataPag = cella("dataPagamento");
    fatture.push({
      beneficiario: cella("beneficiario"),
      rimborsoA: cella("rimborsoA"),
      descrizione: cella("descrizione"),
      data: cella("data"),
      doc: cella("doc"),
      importo,
      centro: cella("centro"),
      categoria: normalizzaCategoria(cella("categoria")),
      metodo: cella("metodo"),
      dataPagamento: dataPag,
      pagata: dataPag !== "",
    });
  }
  return { fatture, righeConErrore };
}

function normalizzaCategoria(raw) {
  const k = normKey(raw);
  if (!k) return CATEGORIA_ALTRO;
  const esatta = CATEGORIE.find((c) => normKey(c) === k);
  if (esatta) return esatta;
  const parziale = CATEGORIE.find((c) => {
    const ck = normKey(c);
    return k.length >= 5 && (ck.startsWith(k) || k.startsWith(ck.slice(0, 8)));
  });
  return parziale || CATEGORIA_ALTRO;
}

// ============================================================
// CARICAMENTO — 3 letture per festa, ogni festa indipendente
// ============================================================

const STATE = {
  festa: festaDiDefault(),
  panel: "andamento",
  rank: { piatti: "nr", bibite: "nr" },
  data: {}, // id festa -> { andamento, classifiche, spese, raw, urls, errors, fetchedAt }
};

function festaDiDefault() {
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  for (const f of FESTE) {
    const ultimo = dateFromKey(f.giorni[f.giorni.length - 1]);
    if (ultimo && ultimo >= oggi) return f.id;
  }
  return "tutte";
}

async function loadFesta(f) {
  const prev = STATE.data[f.id] || {};
  const res = { raw: {}, urls: {}, errors: {}, fetchedAt: new Date() };
  const letture = [
    ["andamento", TAB_STATISTICHE, f.rangeAndamento, (rows) => parseAndamento(rows, f)],
    ["classifiche", TAB_STATISTICHE, RANGE_CLASSIFICHE, parseClassifiche],
    ["spese", TAB_SPESE, RANGE_SPESE, parseSpese],
  ];
  await Promise.all(
    letture.map(async ([key, tab, range, parser]) => {
      const url = gvizUrl(f.sheetId, tab, range);
      res.urls[key] = url;
      try {
        const rows = await fetchCsv(url);
        res.raw[key] = rows;
        res[key] = parser(rows);
      } catch (err) {
        res.errors[key] = err.message || String(err);
        if (prev[key]) res[key] = prev[key]; // tiene l'ultimo dato buono
      }
    })
  );
  return res;
}

async function refreshData() {
  setStatus(true, "aggiornamento...");
  const risultati = await Promise.all(FESTE.map((f) => loadFesta(f)));
  FESTE.forEach((f, i) => { STATE.data[f.id] = risultati[i]; });

  const errori = [];
  FESTE.forEach((f) => {
    const e = STATE.data[f.id].errors;
    Object.entries(e).forEach(([k, msg]) => errori.push(`${f.nome} (${k}): ${msg}`));
  });
  if (errori.length) {
    setStatus(false, "dati parziali");
    showError("Alcuni dati non si sono aggiornati. " + (DEBUG_MODE ? errori.join(" · ") : "Apri con ?debug=1 per i dettagli."));
  } else {
    setStatus(true, "in linea");
    hideError();
  }
  document.getElementById("lastUpdate").textContent =
    new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

  renderAll();
  if (DEBUG_MODE && (debugAperto || !debugMostratoUnaVolta)) showDebugPanel();
}

// ============================================================
// FORMATTAZIONE
// ============================================================

function fmtEuro(n) {
  return n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}
function fmtEuroDec(n) {
  return n.toLocaleString("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtInt(n) {
  return Math.round(n).toLocaleString("it-IT");
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function nomeFesta(id) {
  const f = FESTE.find((x) => x.id === id);
  return f ? f.nome : "Tutte le feste";
}
function festeSelezionate() {
  return STATE.festa === "tutte" ? FESTE : FESTE.filter((f) => f.id === STATE.festa);
}
const VUOTO = '<div class="empty-state">Nessun dato ancora</div>';
const CARICAMENTO = '<div class="empty-state">Caricamento…</div>';

function caricato() {
  return FESTE.some((f) => STATE.data[f.id]);
}

// ============================================================
// RENDER — intestazione e pillole
// ============================================================

function renderHeader() {
  const eyebrow = document.getElementById("eyebrow");
  if (STATE.festa === "tutte") {
    eyebrow.textContent = "Tutte le feste · 6 – 29 novembre";
  } else {
    const f = FESTE.find((x) => x.id === STATE.festa);
    eyebrow.textContent = f.nome + " · " + f.date;
  }
  document.querySelectorAll("#festaPills button").forEach((b) => {
    b.classList.toggle("active", b.dataset.festa === STATE.festa);
  });
}

function renderKpis(container, items) {
  container.innerHTML = items
    .map(
      (k) => `<div class="kpi-card"><div class="label">${esc(k.label)}</div><div class="value">${esc(k.value)}</div></div>`
    )
    .join("");
}

// ============================================================
// RENDER — Andamento
// ============================================================

function renderAndamento() {
  const kpi = document.getElementById("kpiAndamento");
  const box = document.getElementById("andamentoBody");
  const extra = document.getElementById("weekendCards");
  extra.innerHTML = "";

  if (!caricato()) { renderKpis(kpi, kpiAndamentoItems(null)); box.innerHTML = CARICAMENTO; return; }

  if (STATE.festa === "tutte") {
    const righe = FESTE.map((f) => {
      const a = (STATE.data[f.id] || {}).andamento;
      return { f, tot: a ? a.totale : sommaGiorni([]) };
    });
    const tot = sommaGiorni(righe.map((r) => r.tot));
    renderKpis(kpi, kpiAndamentoItems(tot));
    document.getElementById("andamentoTitle").textContent = "Festa per festa";
    box.innerHTML =
      tableHead("Festa") +
      righe
        .map(
          (r) => `<button class="cmp-row as-link" data-goto="${r.f.id}">
            <div class="c-day"><span class="nm">${esc(r.f.nome)}</span><span class="sub">${esc(r.f.date)}</span></div>
            ${numCells(r.tot)}
          </button>`
        )
        .join("") +
      totalRow("Totale", tot);
    return;
  }

  const f = FESTE.find((x) => x.id === STATE.festa);
  const a = (STATE.data[f.id] || {}).andamento;
  document.getElementById("andamentoTitle").textContent = "Giorno per giorno";
  if (!a || a.giorni.length === 0) {
    renderKpis(kpi, kpiAndamentoItems(null));
    box.innerHTML = VUOTO + giorniPrevisti(f, []);
    return;
  }
  renderKpis(kpi, kpiAndamentoItems(a.totale));

  const oggi = todayKey();
  const riga = (g) => `<div class="cmp-row${g.dateKey === oggi ? " is-today" : ""}">
      <div class="c-day">${esc(g.label)}${g.turni > 1 ? `<span class="sub">${g.turni} righe sommate</span>` : ""}</div>
      ${numCells(g)}
    </div>`;

  if (f.weekend) {
    const perWeekend = f.weekend.map((wk, w) => ({ wk, giorni: a.giorni.filter((g) => g.weekend === w) }));
    extra.innerHTML = perWeekend
      .map((p) => {
        const t = sommaGiorni(p.giorni);
        return `<div class="wk-card">
          <div class="wk-name">${esc(p.wk.nome)}</div>
          <div class="wk-dates">${p.wk.giorni.map(labelFromKey).join(" · ")}</div>
          <div class="wk-val">${fmtEuro(t.incasso)}</div>
          <div class="wk-sub">${fmtInt(t.coperti)} coperti · ${t.coperti ? fmtEuroDec(t.medio) : "—"}/pasto</div>
        </div>`;
      })
      .join("");
    box.innerHTML =
      tableHead("Giorno") +
      perWeekend
        .map((p) => {
          const previsti = giorniPrevisti({ giorni: p.wk.giorni }, p.giorni);
          return `<div class="group-head">${esc(p.wk.nome)}</div>` +
            p.giorni.map(riga).join("") + previsti +
            (p.giorni.length ? totalRow("Totale " + p.wk.nome, sommaGiorni(p.giorni), true) : "");
        })
        .join("") +
      totalRow("Totale Sagra", a.totale);
    return;
  }

  box.innerHTML = tableHead("Giorno") + a.giorni.map(riga).join("") + giorniPrevisti(f, a.giorni) + totalRow("Totale", a.totale);
}

function kpiAndamentoItems(t) {
  return [
    { label: "Incasso tot.", value: t ? fmtEuro(t.incasso) : "—" },
    { label: "Coperti tot.", value: t ? fmtInt(t.coperti) : "—" },
    { label: "€/pasto", value: t && t.coperti ? fmtEuroDec(t.medio) : "—" },
  ];
}

function tableHead(primaColonna) {
  return `<div class="cmp-head"><div>${primaColonna}</div><div class="c-num">Incasso</div><div class="c-num">Coperti</div><div class="c-num">€/pasto</div></div>`;
}
function numCells(t) {
  const medio = t.coperti ? t.incasso / t.coperti : 0;
  return `<div class="c-num"><b>${fmtEuro(t.incasso)}</b></div>
    <div class="c-num">${fmtInt(t.coperti)}</div>
    <div class="c-num">${t.coperti ? fmtEuroDec(medio) : "—"}</div>`;
}
function totalRow(label, t, piccolo) {
  return `<div class="cmp-row total${piccolo ? " subtotal" : ""}"><div class="c-day">${esc(label)}</div>${numCells(t)}</div>`;
}
/** Giorni in calendario non ancora presenti nel foglio: righe chiare con "—" */
function giorniPrevisti(f, giorniConDati) {
  const presenti = new Set(giorniConDati.map((g) => g.dateKey));
  return f.giorni
    .filter((k) => !presenti.has(k))
    .map(
      (k) => `<div class="cmp-row future"><div class="c-day">${esc(labelFromKey(k))}</div>
        <div class="c-num">—</div><div class="c-num">—</div><div class="c-num">—</div></div>`
    )
    .join("");
}

// ============================================================
// RENDER — Piatti / Bibite
// ============================================================

function renderRank(cat) {
  const box = document.getElementById(cat + "List");
  const totBox = document.getElementById(cat + "Tot");
  if (!caricato()) { box.innerHTML = CARICAMENTO; totBox.textContent = ""; return; }

  const mode = STATE.rank[cat];
  const somma = new Map();
  festeSelezionate().forEach((f) => {
    const c = (STATE.data[f.id] || {}).classifiche;
    if (!c) return;
    c[cat][mode].forEach((v) => somma.set(v.nome, (somma.get(v.nome) || 0) + v.valore));
  });
  const lista = [...somma.entries()].map(([nome, valore]) => ({ nome, valore })).sort((a, b) => b.valore - a.valore);

  if (!lista.length) { box.innerHTML = VUOTO; totBox.textContent = ""; return; }

  const tot = lista.reduce((s, v) => s + v.valore, 0);
  const fmt = mode === "nr" ? (n) => fmtInt(n) : (n) => fmtEuro(n);
  totBox.textContent = `${lista.length} voci · totale ${mode === "nr" ? fmtInt(tot) + " pezzi" : fmtEuro(tot)}`;
  const max = lista[0].valore;
  box.innerHTML = lista
    .map(
      (v, i) => `<div class="rank-item">
        <div class="pos">${i + 1}</div>
        <div class="name">${esc(v.nome)}<div class="bar"><span style="width:${Math.max(2, (v.valore / max) * 100)}%"></span></div></div>
        <div class="val">${fmt(v.valore)}</div>
      </div>`
    )
    .join("");
}

// ============================================================
// RENDER — Spese (prima da pagare, poi riepilogo per categoria, poi pagate)
// ============================================================

function renderSpese() {
  const kpi = document.getElementById("kpiSpese");
  const box = document.getElementById("speseBody");
  if (!caricato()) { renderKpis(kpi, kpiSpeseItems(null)); box.innerHTML = CARICAMENTO; return; }

  const fatture = [];
  festeSelezionate().forEach((f) => {
    const s = (STATE.data[f.id] || {}).spese;
    if (s) s.fatture.forEach((x) => fatture.push({ ...x, festa: f.nome }));
  });
  if (!fatture.length) { renderKpis(kpi, kpiSpeseItems(null)); box.innerHTML = VUOTO; return; }

  const daPagare = fatture.filter((x) => !x.pagata);
  const pagate = fatture.filter((x) => x.pagata);
  const t = {
    totale: fatture.reduce((s, x) => s + x.importo, 0),
    pagate: pagate.reduce((s, x) => s + x.importo, 0),
    daPagare: daPagare.reduce((s, x) => s + x.importo, 0),
  };
  renderKpis(kpi, kpiSpeseItems(t));

  const mostraFesta = STATE.festa === "tutte";
  const voce = (x) => `<div class="spesa${x.pagata ? " pagata" : ""}">
      <div class="sp-top">
        <div class="sp-who">${esc(x.beneficiario || x.descrizione)}</div>
        <div class="sp-amt">${fmtEuroDec(x.importo)}</div>
      </div>
      ${x.beneficiario && x.descrizione ? `<div class="sp-desc">${esc(x.descrizione)}</div>` : ""}
      <div class="sp-tags">
        ${mostraFesta ? `<span class="tag festa">${esc(x.festa)}</span>` : ""}
        <span class="tag">${esc(etichettaCategoria(x.categoria))}</span>
        ${x.rimborsoA ? `<span class="tag rimborso">rimborso a ${esc(x.rimborsoA)}</span>` : ""}
        ${x.doc ? `<span class="tag soft">doc. ${esc(x.doc)}</span>` : ""}
        ${x.data ? `<span class="tag soft">${esc(x.data)}</span>` : ""}
        ${x.pagata ? `<span class="tag ok">pagata ${esc(x.dataPagamento)}${x.metodo ? " · " + esc(x.metodo) : ""}</span>` : ""}
      </div>
    </div>`;

  // Riepilogo per categoria ricalcolato dalle fatture
  const perCat = new Map([...CATEGORIE, CATEGORIA_ALTRO].map((c) => [c, { tot: 0, daPagare: 0 }]));
  fatture.forEach((x) => {
    const c = perCat.get(x.categoria);
    c.tot += x.importo;
    if (!x.pagata) c.daPagare += x.importo;
  });
  const maxCat = Math.max(...[...perCat.values()].map((c) => c.tot), 1);
  const righeCat = [...perCat.entries()]
    .filter(([nome, c]) => nome !== CATEGORIA_ALTRO || c.tot !== 0)
    .map(
      ([nome, c]) => `<div class="cat-row${c.tot ? "" : " zero"}">
        <div class="cat-top"><span>${esc(etichettaCategoria(nome))}</span><b>${c.tot ? fmtEuroDec(c.tot) : "—"}</b></div>
        <div class="bar"><span style="width:${(Math.max(c.tot, 0) / maxCat) * 100}%"></span></div>
        ${c.daPagare ? `<div class="cat-due">da pagare ${fmtEuroDec(c.daPagare)}</div>` : ""}
      </div>`
    )
    .join("");

  // Rimborsi ancora da fare, per persona
  const rimborsi = new Map();
  daPagare.filter((x) => x.rimborsoA).forEach((x) => rimborsi.set(x.rimborsoA, (rimborsi.get(x.rimborsoA) || 0) + x.importo));

  // Solo in "Tutte": divisione per festa
  const perFesta = mostraFesta
    ? `<div class="section-title">Per festa</div>
       <div class="cat-list">${FESTE.map((f) => {
         const ff = fatture.filter((x) => x.festa === f.nome);
         const tt = ff.reduce((s, x) => s + x.importo, 0);
         const dp = ff.filter((x) => !x.pagata).reduce((s, x) => s + x.importo, 0);
         return `<div class="cat-row${tt ? "" : " zero"}"><div class="cat-top"><span>${esc(f.nome)}</span><b>${tt ? fmtEuroDec(tt) : "—"}</b></div>
           ${dp ? `<div class="cat-due">da pagare ${fmtEuroDec(dp)}</div>` : ""}</div>`;
       }).join("")}</div>`
    : "";

  const ordina = (a, b) => (dataOrd(a.data) - dataOrd(b.data)) || b.importo - a.importo;

  box.innerHTML = `
    <div class="section-title">Da pagare <span class="count">${daPagare.length}</span></div>
    ${daPagare.length ? `<div class="spese-list">${daPagare.sort(ordina).map(voce).join("")}</div>` : '<div class="empty-state small">Nessuna spesa da pagare</div>'}
    ${rimborsi.size ? `<div class="section-title">Rimborsi da fare</div>
      <div class="cat-list">${[...rimborsi.entries()].map(([chi, imp]) => `<div class="cat-row"><div class="cat-top"><span>${esc(chi)}</span><b>${fmtEuroDec(imp)}</b></div></div>`).join("")}</div>` : ""}
    ${perFesta}
    <div class="section-title">Per categoria</div>
    <div class="cat-list">${righeCat}</div>
    <details class="pagate">
      <summary>Già pagate <span class="count">${pagate.length}</span> · ${fmtEuroDec(t.pagate)}</summary>
      ${pagate.length ? `<div class="spese-list">${pagate.sort(ordina).map(voce).join("")}</div>` : '<div class="empty-state small">Nessuna spesa pagata</div>'}
    </details>`;
}

function kpiSpeseItems(t) {
  return [
    { label: "Spese tot.", value: t ? fmtEuro(t.totale) : "—" },
    { label: "Pagate", value: t ? fmtEuro(t.pagate) : "—" },
    { label: "Da pagare", value: t ? fmtEuro(t.daPagare) : "—" },
  ];
}

function etichettaCategoria(c) {
  const breve = {
    "SPESE VARIE (TOVAGLIE / ACCESSORI)": "Spese varie (tovaglie / accessori)",
    "UTENZE - ASSICURAZIONI - SPETTACOLI": "Utenze · assicurazioni · spettacoli",
    "RIMBORSI SPESE (BENZA & CO)": "Rimborsi spese (benza & co)",
    "PUBBLICITA'": "Pubblicità",
  };
  if (breve[c]) return breve[c];
  return c.charAt(0) + c.slice(1).toLowerCase();
}

/** Data "dd/mm/yyyy" -> numero ordinabile (in fondo se mancante) */
function dataOrd(s) {
  const m = String(s || "").match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (!m) return 99999999;
  const y = m[3] ? (m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10)) : ANNO;
  return y * 10000 + parseInt(m[2], 10) * 100 + parseInt(m[1], 10);
}

// ============================================================
// APP — navigazione
// ============================================================

function renderAll() {
  renderHeader();
  renderAndamento();
  renderRank("piatti");
  renderRank("bibite");
  renderSpese();
}

function switchPanel(name) {
  STATE.panel = name;
  document.querySelectorAll("section.panel").forEach((p) => p.classList.toggle("active", p.id === "panel-" + name));
  document.querySelectorAll("nav.tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.panel === name));
  window.scrollTo(0, 0);
}

function selectFesta(id) {
  STATE.festa = id;
  renderAll();
}

function setStatus(ok, msg) {
  document.getElementById("statusDot").classList.toggle("stale", !ok);
  document.getElementById("statusText").textContent = msg;
}
function showError(msg) {
  const el = document.getElementById("errorBanner");
  el.textContent = msg;
  el.classList.add("show");
}
function hideError() {
  document.getElementById("errorBanner").classList.remove("show");
}

// Pillole feste
document.getElementById("festaPills").innerHTML =
  FESTE.map((f) => `<button data-festa="${f.id}">${esc(f.breve || f.nome)}</button>`).join("") +
  `<button data-festa="tutte">Tutte</button>`;
document.getElementById("festaPills").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-festa]");
  if (b) selectFesta(b.dataset.festa);
});

// Dalla tabella "Tutte": tocca una festa per aprirla
document.getElementById("andamentoBody").addEventListener("click", (e) => {
  const b = e.target.closest("[data-goto]");
  if (b) selectFesta(b.dataset.goto);
});

document.querySelectorAll("nav.tabbar button").forEach((btn) => {
  btn.addEventListener("click", () => switchPanel(btn.dataset.panel));
});

["piatti", "bibite"].forEach((cat) => {
  document.querySelectorAll(`#panel-${cat} .rank-toggle button`).forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(`#panel-${cat} .rank-toggle button`).forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      STATE.rank[cat] = btn.dataset.mode;
      renderRank(cat);
    });
  });
});

// ============================================================
// DIAGNOSTICA — apri con ?debug=1 in fondo all'URL
// Pannello nero/verde: per ogni festa mostra URL, righe grezze ricevute e dati letti.
// ============================================================

const DEBUG_MODE = new URLSearchParams(location.search).get("debug") === "1";
let debugAperto = false;
let debugMostratoUnaVolta = false;

function rawTable(rows, max) {
  if (!rows) return "  (nessuna risposta)\n";
  if (!rows.length) return "  (0 righe — range vuoto)\n";
  return rows
    .slice(0, max)
    .map((r, i) => "  " + String(i + 1).padStart(2, " ") + " | " + r.map((c) => (c === "" ? "·" : c)).join(" | "))
    .join("\n") + (rows.length > max ? `\n  ... altre ${rows.length - max} righe` : "") + "\n";
}

function showDebugPanel() {
  debugMostratoUnaVolta = true;
  debugAperto = true;
  let panel = document.getElementById("debugPanel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "debugPanel";
    panel.addEventListener("click", () => { panel.remove(); debugAperto = false; });
    document.body.appendChild(panel);
  }
  let t = "DEBUG — tocca per chiudere (il pulsante DEBUG in basso a destra lo riapre)\n";
  t += "Aggiornato: " + new Date().toLocaleTimeString("it-IT") + "\n";
  t += "Legenda righe grezze: · = cella vuota. Confrontale con il foglio.\n";

  FESTE.forEach((f) => {
    const d = STATE.data[f.id];
    t += "\n==================================================\n";
    t += f.nome.toUpperCase() + "  (" + f.sheetId + ")\n";
    t += "==================================================\n";
    if (!d) { t += "(non ancora caricata)\n"; return; }

    t += `\n--- ANDAMENTO · tab "${TAB_STATISTICHE}" · range ${f.rangeAndamento}\n`;
    if (d.errors.andamento) t += "  ERRORE: " + d.errors.andamento + "\n";
    t += "  URL: " + d.urls.andamento + "\n";
    if (d.raw.andamento) {
      const ra = d.raw.andamento;
      const iData = ra.findIndex((r) => String(r[0] || "").trim().toUpperCase() === "DATA");
      if (iData === -1) {
        t += "  ATTENZIONE: riga con \"DATA\" in colonna B non trovata. Righe grezze:\n" + rawTable(ra, 20);
      } else {
        t += `  Tabella trovata alla riga ${iData + 1} del foglio (DATA, giorni, TOTALE):\n`;
        t += rawTable(ra.slice(iData, iData + 12), 12);
      }
    } else {
      t += rawTable(null);
    }
    if (d.andamento) {
      t += "  Giorni letti (intestazione/TOTALE/vuote scartate):\n";
      d.andamento.giorni.forEach((g) => {
        t += `   - ${g.label}  [${g.dateKey || "senza data"}]  coperti ${g.coperti}  incasso ${g.incasso.toFixed(2)}` +
          (g.weekend != null ? `  → ${f.weekend[g.weekend].nome}` : "") + (g.turni > 1 ? `  (${g.turni} righe sommate)` : "") + "\n";
      });
      const tt = d.andamento.totale;
      t += `  TOTALE ricalcolato: coperti ${tt.coperti} · incasso ${tt.incasso.toFixed(2)} · €/pasto ${tt.medio.toFixed(2)}\n`;
    }

    t += `\n--- PIATTI / BIBITE · tab "${TAB_STATISTICHE}" · range ${RANGE_CLASSIFICHE}\n`;
    if (d.errors.classifiche) t += "  ERRORE: " + d.errors.classifiche + "\n";
    t += "  URL: " + d.urls.classifiche + "\n  Righe grezze (colonne M | N | O | P | Q):\n";
    t += rawTable(d.raw.classifiche, 60);
    if (d.classifiche) {
      const c = d.classifiche;
      const riass = (arr) => arr.length + " voci" + (arr.length ? " (1ª: " + arr[0].nome + " = " + arr[0].valore + ")" : "");
      t += "  Piatti per pezzi:  " + riass(c.piatti.nr) + "\n";
      t += "  Piatti per incasso:" + riass(c.piatti.euro) + "\n";
      t += "  Bibite per pezzi:  " + riass(c.bibite.nr) + "\n";
      t += "  Bibite per incasso:" + riass(c.bibite.euro) + "\n";
    }

    t += `\n--- SPESE · tab "${TAB_SPESE}" · range ${RANGE_SPESE}\n`;
    if (d.errors.spese) t += "  ERRORE: " + d.errors.spese + "\n";
    t += "  URL: " + d.urls.spese + "\n  Prime righe grezze (colonne A..J):\n";
    t += rawTable(d.raw.spese, 8);
    if (d.spese) {
      const fs = d.spese.fatture;
      t += `  Fatture lette: ${fs.length} · da pagare ${fs.filter((x) => !x.pagata).length} · pagate ${fs.filter((x) => x.pagata).length}\n`;
      fs.slice(0, 5).forEach((x) => {
        t += `   - ${x.beneficiario || x.descrizione} · ${x.importo.toFixed(2)} · ${x.categoria} · ${x.pagata ? "pagata " + x.dataPagamento : "DA PAGARE"}\n`;
      });
      const altro = fs.filter((x) => x.categoria === CATEGORIA_ALTRO);
      if (d.spese.righeConErrore) t += `  ATTENZIONE: ${d.spese.righeConErrore} righe con IMPORTO in errore (#N/A, #REF!...) non conteggiate\n`;
      if (altro.length) t += `  ATTENZIONE: ${altro.length} fatture con categoria vuota o non riconosciuta\n`;
    }
  });

  panel.textContent = t;
}

if (DEBUG_MODE) {
  const btn = document.createElement("button");
  btn.id = "debugBtn";
  btn.textContent = "DEBUG";
  btn.addEventListener("click", showDebugPanel);
  document.body.appendChild(btn);
}

// ============================================================
// AVVIO
// ============================================================

renderAll();
refreshData();
setInterval(refreshData, REFRESH_SECONDS * 1000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshData();
});

// Service worker (solo per la "scocca" dell'app, i dati sono sempre live)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
