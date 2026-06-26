'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors    = require('cors');
const bp      = require('body-parser');
const https   = require('https');
const http    = require('http');
const fs      = require('fs');
const path    = require('path');
const db      = require('./database');

const app  = express();
const PORT = process.env.PORT || 52700;

app.use(cors({ origin: '*' }));
app.use(bp.json({ limit: '50mb' }));
app.use(bp.urlencoded({ extended: true, limit: '50mb' }));

// ══════════════════════════════════════════════════════════════
// OLLAMA — local AI
// ══════════════════════════════════════════════════════════════
function callOllama(prompt, model = 'llama3', ollamaUrl = 'http://127.0.0.1:11434', maxTokens = 2000) {
  return new Promise((resolve, reject) => {
    let base;
    try { base = new URL(ollamaUrl); } catch { base = new URL('http://127.0.0.1:11434'); }

    const body = JSON.stringify({
      model,
      prompt,
      stream: false,
      options: { temperature: 0.3, num_predict: maxTokens, top_p: 0.9 }
    });

    const isHttps = base.protocol === 'https:';
    const lib     = isHttps ? https : http;
    const options = {
      hostname: base.hostname,
      port:     base.port || (isHttps ? 443 : 11434),
      path:     '/api/generate',
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };

    let raw = '';
    const req = lib.request(options, res => {
      res.setEncoding('utf8');
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.error) return reject(new Error('Ollama error: ' + parsed.error));
          if (parsed.response) return resolve(parsed.response.trim());
          reject(new Error('No response from Ollama. Raw: ' + raw.slice(0, 300)));
        } catch (e) {
          reject(new Error('Parse error: ' + raw.slice(0, 300)));
        }
      });
    });
    req.on('error', e => reject(new Error('Ollama connection failed: ' + e.message + ' — Is Ollama running? Run: ollama serve')));
    req.setTimeout(180000, () => { req.destroy(); reject(new Error('Ollama timeout (180s). Model may still be loading.')); });
    req.write(body);
    req.end();
  });
}

function listOllamaModels(ollamaUrl = 'http://127.0.0.1:11434') {
  return new Promise((resolve) => {
    let base;
    try { base = new URL(ollamaUrl); } catch { base = new URL('http://127.0.0.1:11434'); }
    const isHttps = base.protocol === 'https:';
    const lib     = isHttps ? https : http;
    const options = {
      hostname: base.hostname,
      port:     base.port || (isHttps ? 443 : 11434),
      path:     '/api/tags', method: 'GET'
    };
    let raw = '';
    const req = lib.request(options, res => {
      res.setEncoding('utf8');
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        try { resolve((JSON.parse(raw).models || []).map(m => m.name)); }
        catch { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.setTimeout(5000, () => { req.destroy(); resolve([]); });
    req.end();
  });
}

// ── ROBUST JSON EXTRACTOR ─────────────────────────────────────────────────────
// llama3 often wraps JSON in markdown, adds text before/after — handle all cases
function extractJSON(text) {
  if (!text) throw new Error('Empty response from model');

  // 1. Strip markdown fences
  let clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

  // 2. Try direct parse
  try { return JSON.parse(clean); } catch {}

  // 3. Find first { to last } (greedy)
  const firstBrace = clean.indexOf('{');
  const lastBrace  = clean.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const slice = clean.slice(firstBrace, lastBrace + 1);
    try { return JSON.parse(slice); } catch {}

    // 4. Try to fix common issues: trailing commas, single quotes
    const fixed = slice
      .replace(/,\s*([}\]])/g, '$1')   // trailing commas
      .replace(/'/g, '"')               // single quotes
      .replace(/(\w+)\s*:/g, '"$1":')   // unquoted keys
      .replace(/:\s*'([^']*)'/g, ': "$1"'); // single-quoted values
    try { return JSON.parse(fixed); } catch {}
  }

  // 5. Find first [ to last ]
  const firstBracket = clean.indexOf('[');
  const lastBracket  = clean.lastIndexOf(']');
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    try { return JSON.parse(clean.slice(firstBracket, lastBracket + 1)); } catch {}
  }

  throw new Error('Could not parse JSON from model response. Response was: ' + text.slice(0, 200));
}

// ── HEALTH ────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true, port: PORT }));

// ── LIST OLLAMA MODELS ────────────────────────────────────────────────────────
app.post('/ollama-models', async (req, res) => {
  const { ollamaUrl } = req.body;
  const models = await listOllamaModels(ollamaUrl || 'http://127.0.0.1:11434');
  res.json({ ok: true, models });
});

// ── TEST OLLAMA ───────────────────────────────────────────────────────────────
app.post('/test-key', async (req, res) => {
  const { ollamaUrl, ollamaModel } = req.body;
  const url   = ollamaUrl   || 'http://127.0.0.1:11434';
  const model = ollamaModel || 'llama3';
  try {
    const result = await callOllama('Reply with exactly one word: WORKS', model, url, 10);
    res.json({ ok: true, message: `✅ Ollama (${model}) is working! Response: ${result.slice(0, 60)}` });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── REGISTER ──────────────────────────────────────────────────────────────────
app.post('/register', async (req, res) => {
  try {
    const { username, password, name, role, branch, college, year, avatar } = req.body;
    if (!username || !password || !name) return res.json({ ok: false, error: 'Name, username and password are required' });
    if (password.length < 4) return res.json({ ok: false, error: 'Password must be at least 4 characters' });
    
    await db.registerUser({ username, password, name, role, branch, college, year, avatar });
    await db.logActivity(username, 'register', req.ip, { name, role });
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── LOGIN ─────────────────────────────────────────────────────────────────────
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ ok: false, error: 'Enter username and password' });
    
    const user = await db.loginUser(username, password);
    await db.logActivity(username, 'login', req.ip);
    res.json({ ok: true, user });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── CHAT ──────────────────────────────────────────────────────────────────────
app.post('/chat', async (req, res) => {
  const { messages, ollamaUrl, ollamaModel, language, username } = req.body;
  const url   = ollamaUrl   || 'http://127.0.0.1:11434';
  const model = ollamaModel || 'llama3';

  const langLine = (language && language !== 'English')
    ? `You MUST reply entirely in ${language}. Do not use English.\n` : '';

  // Last 6 messages for context
  const history = (messages || []).slice(-6)
    .map(m => `${m.role === 'user' ? 'Student' : 'Assistant'}: ${m.content}`)
    .join('\n');

  const lastQuestion = messages && messages.length
    ? messages[messages.length - 1].content : '';

  const prompt = `You are the intelligent backend for "Akshar.ai", a specialized desktop learning platform for B.Tech students. Your purpose is to act as a high-level academic tutor.
${langLine}
# Mandatory Subject Context
When the user mentions these acronyms, use ONLY these definitions:
1. UID (User Interface Design): Focus ONLY on UI/UX, Design Thinking, Wireframing, and Usability. NO connection to UIDAI or Aadhaar.
2. ADM (Glimpses of Glorious India): This is a History and Culture subject. Focus on Ancient Indian Heritage, Architecture, and Civilization. Do NOT treat it as a technical subject.

# Core Rules
- Answer ONLY B.Tech academic questions related to: Linear Algebra, Discrete Mathematics, UID, Modern Physics, ADM, OOPS.
- If asked about unrelated topics, reply: "I can only assist with B.Tech academic subjects on Akshar.ai."
- Be accurate. Do NOT hallucinate facts, definitions, or examples.
- Use bullet points and numbered steps for clarity. Bold key terms with **.
- Keep answers focused and concise. Do NOT repeat the question.
- Support English and Tenglish (Telugu-English mix) if the user writes in Tenglish.

# Tone
Professional, academic, and supportive — like a senior B.Tech tutor.

Conversation so far:
${history}

Student's question: ${lastQuestion}

Your answer:`;

  try {
    const reply = await callOllama(prompt, model, url, 800);
    await db.logActivity(username, 'chat', req.ip, { model, language, messageLength: lastQuestion.length });
    res.json({ ok: true, reply });
  } catch (e) {
    await db.logActivity(username, 'chat_failed', req.ip, { error: e.message });
    res.json({ ok: false, error: e.message });
  }
});

// ── QUIZ ──────────────────────────────────────────────────────────────────────
app.post('/quiz', async (req, res) => {
  const { subject, ollamaUrl, ollamaModel, custom, username } = req.body;
  const url   = ollamaUrl   || 'http://127.0.0.1:11434';
  const model = ollamaModel || 'llama3';

  if (!ollamaModel) {
    await db.logActivity(username, 'quiz', req.ip, { subject, source: 'fallback' });
    return res.json({ ok: true, data: buildFallbackQuiz(subject), source: 'fallback' });
  }

  // Ask for 5 questions at a time to reduce JSON errors, then repeat
  const prompt = `You are a B.Tech quiz generator. Generate exactly 10 multiple choice questions about "${subject}".

Respond with ONLY a JSON array. No explanation, no markdown, no extra text. Start your response with [ and end with ].

Format:
[
{"id":1,"question":"What is...?","options":{"A":"option1","B":"option2","C":"option3","D":"option4"},"correct":"A","explanation":"Because..."},
{"id":2,"question":"Which...?","options":{"A":"option1","B":"option2","C":"option3","D":"option4"},"correct":"B","explanation":"Because..."}
]`;

  try {
    const raw       = await callOllama(prompt, model, url, 3000);
    const parsed    = extractJSON(raw);
    const questions = Array.isArray(parsed) ? parsed : (parsed.questions || []);
    if (!questions.length) throw new Error('No questions in response');

    // Pad to 25 using fallback if needed
    const fallback = buildFallbackQuiz(subject).questions;
    const final    = questions.length >= 10
      ? questions.slice(0, 25)
      : [...questions, ...fallback.slice(0, 25 - questions.length)];

    // Ensure IDs are correct
    final.forEach((q, i) => { q.id = i + 1; });
    await db.logActivity(username, 'quiz', req.ip, { subject, source: 'ollama' });
    res.json({ ok: true, data: { questions: final }, source: 'ollama' });
  } catch (e) {
    await db.logActivity(username, 'quiz', req.ip, { subject, source: 'fallback', error: e.message });
    res.json({ ok: true, data: buildFallbackQuiz(subject), source: 'fallback', error: e.message });
  }
});

// ── SUMMARIZE ─────────────────────────────────────────────────────────────────
app.post('/summarize', async (req, res) => {
  const { fileBase64, fileExt, fileName, ollamaUrl, ollamaModel, username } = req.body;
  if (!fileBase64) return res.json({ ok: false, error: 'No file data received' });

  const url   = ollamaUrl   || 'http://127.0.0.1:11434';
  const model = ollamaModel || 'llama3';

  let text = '';
  try {
    const buf = Buffer.from(fileBase64, 'base64');
    const ext = (fileExt || '').toLowerCase();
    if (ext === '.txt') {
      text = buf.toString('utf-8');
    } else if (ext === '.pdf') {
      try { text = (await require('pdf-parse')(buf)).text; }
      catch (e) { return res.json({ ok: false, error: 'PDF error: ' + e.message }); }
    } else if (ext === '.docx') {
      try { text = (await require('mammoth').extractRawText({ buffer: buf })).value; }
      catch (e) { return res.json({ ok: false, error: 'DOCX error: ' + e.message }); }
    } else {
      text = buf.toString('utf-8');
    }
  } catch (e) { return res.json({ ok: false, error: 'File error: ' + e.message }); }

  if (!text || text.trim().length < 10)
    return res.json({ ok: false, error: 'Could not extract text. File may be scanned/image-based.' });

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  const snippet   = text.substring(0, 4000); // keep shorter for better JSON compliance

  if (!ollamaModel) {
    await db.logActivity(username, 'summarize', req.ip, { fileName, fileExt, wordCount, source: 'fallback' });
    return res.json({ ok: true, fallback: true, data: {
      title: fileName, word_count: wordCount,
      summary: `"${fileName}" loaded (${wordCount} words). Configure Ollama in Settings for AI summary.`,
      key_points: ['File uploaded', `${wordCount} words`, 'Set model in Settings'],
      important_concepts: [], exam_tips: ['Read carefully', 'Make notes']
    }});
  }

  // Two-step approach: first get plain text summary, then structure it
  const prompt = `You are Akshar.ai, a B.Tech academic tutor. Read this document and respond with ONLY a JSON object. No explanation before or after. Start your response with { and end with }.

Document title: ${fileName}
Content: ${snippet}

JSON format (fill in real content from the document):
{
  "title": "document title here",
  "summary": "write 3-4 sentences summarizing what this document is about",
  "key_points": ["specific point from doc", "specific point from doc", "specific point from doc", "specific point from doc", "specific point from doc"],
  "important_concepts": [
    {"concept": "term from doc", "definition": "what it means"},
    {"concept": "term from doc", "definition": "what it means"},
    {"concept": "term from doc", "definition": "what it means"}
  ],
  "exam_tips": ["tip based on this content", "tip based on this content", "tip based on this content"],
  "word_count": ${wordCount}
}`;

  try {
    const raw  = await callOllama(prompt, model, url, 1500);
    const data = extractJSON(raw);
    data.word_count = wordCount;

    // Validate required fields, fill defaults if missing
    if (!data.title)              data.title = fileName;
    if (!Array.isArray(data.key_points) || !data.key_points.length)
      data.key_points = ['See document for details'];
    if (!Array.isArray(data.important_concepts))
      data.important_concepts = [];
    if (!Array.isArray(data.exam_tips) || !data.exam_tips.length)
      data.exam_tips = ['Read carefully', 'Make notes'];

    await db.logActivity(username, 'summarize', req.ip, { fileName, fileExt, wordCount, source: 'ollama' });
    res.json({ ok: true, data, source: 'ollama' });
  } catch (e) {
    await db.logActivity(username, 'summarize', req.ip, { fileName, fileExt, wordCount, source: 'fallback', error: e.message });
    // Fallback: return what we can without JSON
    res.json({ ok: true, fallback: true, data: {
      title: fileName, word_count: wordCount,
      summary: `Document "${fileName}" has ${wordCount} words. AI response could not be structured — try again or use a smaller file.`,
      key_points: [`File: ${fileName}`, `${wordCount} words extracted`, 'Try summarizing again'],
      important_concepts: [],
      exam_tips: ['Read the document manually', 'Make handwritten notes', 'Focus on headings and definitions']
    }});
  }
});

// ── PLANNER ───────────────────────────────────────────────────────────────────
app.post('/planner', async (req, res) => {
  const { days, subjects, ollamaUrl, ollamaModel, username } = req.body;
  const url   = ollamaUrl   || 'http://127.0.0.1:11434';
  const model = ollamaModel || 'llama3';

  if (!ollamaModel) {
    await db.logActivity(username, 'planner', req.ip, { days, subjects, source: 'fallback' });
    return res.json({ ok: true, data: buildFallbackPlan(days, subjects), source: 'fallback', fallback: true });
  }

  const prompt = `Create a ${days}-day B.Tech exam study plan for these subjects: ${subjects.join(', ')}.

Respond with ONLY a JSON object. No explanation. Start with { and end with }.

{
  "summary": "brief overview of the plan",
  "plan": [
    {
      "day": 1,
      "date_label": "Day 1",
      "focus": "main subject for this day",
      "sessions": [
        {"time": "Morning 9-11 AM", "subject": "subject name", "topics": ["topic1", "topic2"]},
        {"time": "Afternoon 2-4 PM", "subject": "subject name", "topics": ["topic1"]},
        {"time": "Evening 6-8 PM", "subject": "Revision", "topics": ["review key points"]}
      ],
      "tip": "one motivational or study tip",
      "revision": false
    }
  ]
}`;

  try {
    const raw  = await callOllama(prompt, model, url, 3000);
    const data = extractJSON(raw);
    if (!data.plan || !data.plan.length) throw new Error('No plan in response');
    await db.logActivity(username, 'planner', req.ip, { days, subjects, source: 'ollama' });
    res.json({ ok: true, data, source: 'ollama' });
  } catch (e) {
    await db.logActivity(username, 'planner', req.ip, { days, subjects, source: 'fallback', error: e.message });
    res.json({ ok: true, data: buildFallbackPlan(days, subjects), source: 'fallback', fallback: true });
  }
});

// ── FALLBACK DATA ─────────────────────────────────────────────────────────────
function buildFallbackPlan(days, subjects) {
  const tips = ['Stay focused!','Pomodoro: 25min on, 5min off.','Teach to learn.','Stay hydrated.','Review yesterday first.','Mind maps help!','Keep going!','Almost done!'];
  const plan = Array.from({ length: days }, (_, i) => {
    const si  = i % subjects.length;
    const rev = i === days - 1 || (days > 4 && i === Math.floor(days * 0.6));
    return { day: i+1, date_label: `Day ${i+1}`, focus: rev ? 'Revision' : subjects[si], revision: rev, tip: tips[i % tips.length],
      sessions: [
        { time: 'Morning 9-11 AM',  subject: subjects[si], topics: ['Theory', 'Core concepts'] },
        { time: 'Afternoon 2-4 PM', subject: subjects[(si+1) % subjects.length], topics: ['Problems', 'Practice'] },
        { time: 'Evening 6-8 PM',   subject: 'Revision', topics: ['Notes review', 'Flashcards'] }
      ]};
  });
  return { summary: `${days}-day offline plan. Configure Ollama for AI-generated plan.`, plan };
}

function buildFallbackQuiz(subject) {
  const Q = {
    'OOPS':[
      {q:'Which OOP concept bundles data and hides internal details?',o:{A:'Encapsulation',B:'Inheritance',C:'Polymorphism',D:'Abstraction'},a:'A',e:'Encapsulation wraps data + methods, hides internal details.'},
      {q:'Java keyword to prevent method overriding?',o:{A:'static',B:'final',C:'private',D:'abstract'},a:'B',e:'final prevents overriding in subclasses.'},
      {q:'Method overloading means:',o:{A:'Same name, different params',B:'Same name, same params',C:'Override parent',D:'None'},a:'A',e:'Overloading = same name, different parameter list.'},
      {q:'super keyword refers to:',o:{A:'Child class',B:'Parent class',C:'Interface',D:'Package'},a:'B',e:'super refers to the immediate parent class.'},
      {q:'Which is NOT an OOP pillar?',o:{A:'Encapsulation',B:'Compilation',C:'Inheritance',D:'Polymorphism'},a:'B',e:'4 OOP pillars: Encapsulation, Inheritance, Polymorphism, Abstraction.'}
    ],
    'ADM':[
      {q:'Time complexity of binary search?',o:{A:'O(n)',B:'O(log n)',C:'O(n²)',D:'O(1)'},a:'B',e:'Halves search space each step = O(log n).'},
      {q:'Stack follows which principle?',o:{A:'FIFO',B:'LIFO',C:'Random',D:'Priority'},a:'B',e:'Stack = Last In First Out (LIFO).'},
      {q:'Quicksort worst-case complexity?',o:{A:'O(n log n)',B:'O(n)',C:'O(n²)',D:'O(log n)'},a:'C',e:'Worst case when pivot is always min/max = O(n²).'},
      {q:'Hash collision means:',o:{A:'Two keys same slot',B:'Empty table',C:'Table overflow',D:'None'},a:'A',e:'Collision = two different keys map to the same hash slot.'},
      {q:'DFS internally uses:',o:{A:'Queue',B:'Stack',C:'Heap',D:'Array'},a:'B',e:'DFS uses a stack (or call stack via recursion).'}
    ],
    'Linear Algebra':[
      {q:'Determinant of identity matrix?',o:{A:'0',B:'1',C:'n',D:'Undefined'},a:'B',e:'Identity matrix always has determinant = 1.'},
      {q:'Matrix with det=0 is called:',o:{A:'Invertible',B:'Singular',C:'Diagonal',D:'Transpose'},a:'B',e:'Singular matrix has no inverse (det = 0).'},
      {q:'Orthogonal vectors have dot product:',o:{A:'1',B:'-1',C:'0',D:'∞'},a:'C',e:'Perpendicular vectors have zero dot product.'},
      {q:'Rank of zero matrix is:',o:{A:'1',B:'n',C:'0',D:'Undefined'},a:'C',e:'Zero matrix has no linearly independent rows, rank = 0.'},
      {q:'Eigenvalues of diagonal matrix are:',o:{A:'Off-diagonal entries',B:'Diagonal entries',C:'All zeros',D:'All ones'},a:'B',e:'For diagonal matrices, eigenvalues = diagonal entries.'}
    ],
    'Discrete Mathematics':[
      {q:'A set with 3 elements has how many subsets?',o:{A:'6',B:'8',C:'9',D:'3'},a:'B',e:'Subsets = 2^n. For n=3: 2³ = 8.'},
      {q:'A tautology is always:',o:{A:'False',B:'True',C:'Undefined',D:'Varies'},a:'B',e:'Tautology is true for all truth assignments.'},
      {q:'Degree of a graph vertex is:',o:{A:'Vertex count',B:'Adjacent edges count',C:'Total edges',D:'Weight'},a:'B',e:'Degree = number of edges connected to that vertex.'},
      {q:'Pigeonhole: n+1 items in n boxes means:',o:{A:'All equal',B:'One box has 2+ items',C:'Impossible',D:'None'},a:'B',e:'At least one box must contain 2 or more items.'},
      {q:"Set A's complement contains:",o:{A:'All of A',B:'Elements NOT in A',C:'Subset of A',D:'Empty set'},a:'B',e:"A' = elements in universal set not in A."}
    ],
    'Modern Physics':[
      {q:"Planck's constant h = ?",o:{A:'6.626×10⁻³⁴ J·s',B:'3×10⁸ m/s',C:'9.1×10⁻³¹ kg',D:'1.6×10⁻¹⁹ C'},a:'A',e:'h = 6.626×10⁻³⁴ J·s'},
      {q:'Photoelectric effect proves light is:',o:{A:'Wave',B:'Particle',C:'Neither',D:'Both'},a:'B',e:'Photoelectric effect = particle (photon) nature of light.'},
      {q:'de Broglie wavelength formula:',o:{A:'λ=h/mv',B:'λ=mv/h',C:'λ=hv',D:'λ=h+mv'},a:'A',e:'λ = h/p = h/(mv)'},
      {q:'Bohr model: angular momentum is:',o:{A:'Continuous',B:'Quantized: nh/2π',C:'Zero',D:'Random'},a:'B',e:'L = nh/2π, n = principal quantum number.'},
      {q:'Uncertainty principle relates:',o:{A:'Energy-time',B:'Position-momentum',C:'Mass-velocity',D:'Charge-mass'},a:'B',e:'ΔxΔp ≥ ℏ/2'}
    ],
    'UID':[
      {q:'UX stands for:',o:{A:'User Experience',B:'User Exchange',C:'Unified Experience',D:'Universal Extension'},a:'A',e:'UX = User Experience.'},
      {q:'Screen color model:',o:{A:'CMYK',B:'RGB',C:'HSL only',D:'Pantone'},a:'B',e:'Screens use RGB additive color model.'},
      {q:'Wireframe in UI design is:',o:{A:'Final design',B:'Low-fidelity layout',C:'Color palette',D:'Font guide'},a:'B',e:'Wireframe = simple skeletal layout blueprint.'},
      {q:"Fitts's Law is about:",o:{A:'Color contrast',B:'Time to acquire a target',C:'Font size',D:'Animation speed'},a:'B',e:'Time to reach a target depends on size and distance.'},
      {q:'UX Persona is:',o:{A:'Real user account',B:'Fictional user archetype',C:'Developer role',D:'Test script'},a:'B',e:'Persona = fictional but realistic user archetype.'}
    ]
  };
  const pool = Q[subject] || Q['OOPS'];
  return { questions: Array.from({ length: 25 }, (_, i) => {
    const s = pool[i % pool.length];
    return { id: i+1, question: s.q, options: s.o, correct: s.a, explanation: s.e };
  })};
}


// ── OCR SUMMARIZE ─────────────────────────────────────────────────────────────
app.post('/ocr-summarize', async (req, res) => {
  const { text, ollamaUrl, ollamaModel, username } = req.body;
  if (!text) return res.json({ ok: false, error: 'No text provided' });
  const url   = ollamaUrl   || 'http://127.0.0.1:11434';
  const model = ollamaModel || 'llama3';
  const prompt = `You are Akshar.ai, a B.Tech academic tutor. A student uploaded a photo of their handwritten notes. The OCR extracted this text:

"${text.substring(0, 3000)}"

Your task:
1. Clean up any OCR errors in the text
2. Identify the subject and topic
3. Provide a structured summary with:
   - **Topic:** (what subject/chapter this is about)
   - **Key Concepts:** (bullet points of main ideas)
   - **Important Points:** (exam-worthy facts)
   - **Definitions:** (any terms defined in the notes)

Be concise and accurate. Format clearly with bullet points.`;
  try {
    const reply = await callOllama(prompt, model, url, 800);
    await db.logActivity(username, 'ocr_summarize', req.ip, { textLength: text.length });
    res.json({ ok: true, summary: reply });
  } catch(e) {
    await db.logActivity(username, 'ocr_summarize_failed', req.ip, { error: e.message });
    res.json({ ok: false, error: e.message });
  }
});

// ── VOICE SUMMARIZE ───────────────────────────────────────────────────────────
app.post('/voice-summarize', async (req, res) => {
  const { text, ollamaUrl, ollamaModel, username } = req.body;
  if (!text) return res.json({ ok: false, error: 'No transcript provided' });
  const url   = ollamaUrl   || 'http://127.0.0.1:11434';
  const model = ollamaModel || 'llama3';
  const prompt = `You are Akshar.ai, a B.Tech academic tutor. A student recorded a live lecture and here is the transcript:

"${text.substring(0, 4000)}"

Convert this lecture transcript into structured, technical study notes:

**Topic:** (identify the subject)

**Key Points:**
• (bullet point 1)
• (bullet point 2)
• (bullet point 3 — add as many as needed)

**Technical Terms Defined:**
• **Term:** definition
• **Term:** definition

**Summary:**
(2-3 sentence summary of the lecture)

**Exam Tips:**
• (what to focus on for exams based on this lecture)

Be accurate, use technical language, and format clearly.`;
  try {
    const notes = await callOllama(prompt, model, url, 1000);
    await db.logActivity(username, 'voice_summarize', req.ip, { textLength: text.length });
    res.json({ ok: true, notes });
  } catch(e) {
    await db.logActivity(username, 'voice_summarize_failed', req.ip, { error: e.message });
    res.json({ ok: false, error: e.message });
  }
});

// ── LOG ACTIVITY (CALLED BY LOCAL CLIENTS) ────────────────────────────────────
app.post('/log-activity', async (req, res) => {
  try {
    const { username, action, ip, details } = req.body;
    await db.logActivity(username, action, ip || req.ip, details);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── GET LOGS (ADMIN ONLY) ─────────────────────────────────────────────────────
app.post('/logs', async (req, res) => {
  try {
    const { username } = req.body;
    if (username !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Access denied: Admin only.' });
    }
    const logs = await db.getLogs(150);
    res.json({ ok: true, logs });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

const HOST = process.env.PORT || process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';
app.listen(PORT, HOST, () => console.log(`Akshar.ai backend ready on port ${PORT} (host: ${HOST})`));
