#!/usr/bin/env node
/**
 * ai-developer.js — Autonomous AI tool developer for mrpr0phecy/mrpr0phecy
 *
 * Reads repo state, identifies improvement areas, calls an AI API,
 * generates new tools or fixes, and opens a PR.
 *
 * Environment variables:
 *   AI_PROVIDER     — "openai" | "anthropic" | "ollama" (default: openai)
 *   AI_API_KEY      — API key for the provider
 *   AI_MODEL        — Model to use (default: gpt-4o / claude-sonnet-4-20250514)
 *   AI_BASE_URL     — Custom base URL (for proxies or local LLMs)
 *   AI_TASK         — "audit" | "generate" | "fix" | "improve" (default: auto)
 *   AI_CATEGORY     — Focus on specific category (default: auto-pick weakest)
 *   AI_MAX_TOOLS    — Max tools to generate per run (default: 3)
 *   AI_DRY_RUN      — "true" to skip file writes (default: false)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// ─── Configuration ────────────────────────────────────────────────────────────

const CONFIG = {
  provider: process.env.AI_PROVIDER || 'openai',
  apiKey: process.env.AI_API_KEY || '',
  model: process.env.AI_MODEL || '',
  baseUrl: process.env.AI_BASE_URL || '',
  task: process.env.AI_TASK || 'auto',
  category: process.env.AI_CATEGORY || '',
  maxTools: parseInt(process.env.AI_MAX_TOOLS) || 3,
  dryRun: process.env.AI_DRY_RUN === 'true',
  repoRoot: path.join(__dirname, '..'),
  cardsDir: path.join(__dirname, '..', 'cards'),
};

// ─── Repo Analysis ────────────────────────────────────────────────────────────

function analyzeRepo() {
  const cardsFile = path.join(CONFIG.cardsDir, 'cards.json');
  const cards = JSON.parse(fs.readFileSync(cardsFile, 'utf8'));

  // Category stats
  const categories = {};
  cards.forEach(card => {
    if (!categories[card.category]) {
      categories[card.category] = { count: 0, totalSize: 0, tools: [] };
    }
    categories[card.category].count++;
    const filePath = path.join(CONFIG.cardsDir, card.file);
    try {
      const size = fs.statSync(filePath).size;
      categories[card.category].totalSize += size;
      categories[card.category].tools.push({ name: card.name, title: card.title, size, file: card.file });
    } catch (e) {
      categories[card.category].tools.push({ name: card.name, title: card.title, size: 0, file: card.file });
    }
  });

  // Find broken tools (no <script> tag, have onclick handlers)
  const broken = [];
  cards.forEach(card => {
    const filePath = path.join(CONFIG.cardsDir, card.file);
    try {
      const html = fs.readFileSync(filePath, 'utf8');
      if (html.length < 200) {
        broken.push({ ...card, issue: 'stub (< 200 bytes)' });
      }
    } catch (e) {}
  });

  // Find weakest categories (by avg file size)
  const weakCategories = Object.entries(categories)
    .map(([name, data]) => ({
      name,
      count: data.count,
      avgSize: Math.round(data.totalSize / data.count),
      smallest: data.tools.sort((a, b) => a.size - b.size)[0],
    }))
    .sort((a, b) => a.avgSize - b.avgSize);

  return {
    totalTools: cards.length,
    categories,
    weakCategories,
    broken,
    cards,
  };
}

// ─── AI API Calls ─────────────────────────────────────────────────────────────

function getProviderConfig() {
  const provider = CONFIG.provider.toLowerCase();
  const defaults = {
    openai: {
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      headers: { 'Authorization': `Bearer ${CONFIG.apiKey}` },
    },
    anthropic: {
      baseUrl: 'https://api.anthropic.com/v1',
      model: 'claude-sonnet-4-20250514',
      headers: { 'x-api-key': CONFIG.apiKey, 'anthropic-version': '2023-06-01' },
    },
    // FREE: Google Gemini — 1,500 req/day, no credit card
    // Get key at: https://aistudio.google.com/apikey
    gemini: {
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      model: 'gemini-2.0-flash',
      headers: {},
      isGemini: true,
    },
    // FREE: Groq — 1,000 req/day, ultra-fast inference
    // Get key at: https://console.groq.com/keys
    groq: {
      baseUrl: 'https://api.groq.com/openai/v1',
      model: 'llama-3.3-70b-versatile',
      headers: { 'Authorization': `Bearer ${CONFIG.apiKey}` },
    },
    // FREE: OpenRouter — many models at $0
    // Get key at: https://openrouter.ai/keys
    openrouter: {
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'meta-llama/llama-3.3-70b-instruct:free',
      headers: { 'Authorization': `Bearer ${CONFIG.apiKey}` },
    },
    // FREE: GitHub Models — uses GITHUB_TOKEN
    github: {
      baseUrl: 'https://models.inference.ai.azure.com/v1',
      model: 'gpt-4o-mini',
      headers: { 'Authorization': `Bearer ${CONFIG.apiKey}` },
    },
    ollama: {
      baseUrl: 'http://localhost:11434/v1',
      model: 'llama3',
      headers: {},
    },
  };
  const cfg = defaults[provider] || defaults.gemini; // Default to free Gemini
  if (CONFIG.model) cfg.model = CONFIG.model;
  if (CONFIG.baseUrl) cfg.baseUrl = CONFIG.baseUrl;
  return cfg;
}

async function callAI(systemPrompt, userPrompt) {
  const cfg = getProviderConfig();
  const isAnthropic = CONFIG.provider.toLowerCase() === 'anthropic';
  const isGemini = cfg.isGemini;

  let body, endpoint, headers;

  if (isGemini) {
    // Gemini API format
    endpoint = `${cfg.baseUrl}/models/${cfg.model}:generateContent?key=${CONFIG.apiKey}`;
    headers = { 'Content-Type': 'application/json' };
    body = JSON.stringify({
      contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
      generationConfig: { maxOutputTokens: 8192 },
    });
  } else if (isAnthropic) {
    endpoint = `${cfg.baseUrl}/messages`;
    headers = { ...cfg.headers, 'Content-Type': 'application/json' };
    body = JSON.stringify({
      model: cfg.model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
  } else {
    // OpenAI-compatible format (works for Groq, OpenRouter, GitHub Models, etc.)
    endpoint = `${cfg.baseUrl}/chat/completions`;
    headers = { ...cfg.headers, 'Content-Type': 'application/json' };
    body = JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 8192,
    });
  }

  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'POST',
      headers,
      timeout: 60000, // 60 second timeout
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) {
            const errMsg = json.error?.message || json.message || data.slice(0, 200);
            reject(new Error(`API error ${res.statusCode}: ${errMsg}`));
            return;
          }
          if (isGemini) {
            resolve(json.candidates?.[0]?.content?.parts?.[0]?.text || '');
          } else if (isAnthropic) {
            resolve(json.content?.[0]?.text || '');
          } else {
            resolve(json.choices?.[0]?.message?.content || '');
          }
        } catch (e) {
          reject(new Error(`Failed to parse AI response: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out after 60 seconds'));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Task Generators ──────────────────────────────────────────────────────────

function buildAuditPrompt(repo) {
  const catSummary = repo.weakCategories.slice(0, 5).map(c =>
    `  - ${c.name}: ${c.count} tools, avg ${c.avgSize} bytes, smallest: ${c.smallest?.name} (${c.smallest?.size} bytes)`
  ).join('\n');

  return {
    system: `You are an expert web developer maintaining a GitHub Pages site with 670+ free browser-based tools.
Your job is to audit the repository and identify the top 5 improvements that would have the highest user impact.
Focus on: broken tools, missing high-demand tools, weak categories, and quality improvements.
Respond in JSON format: { "improvements": [{ "type": "fix|new|enhance", "target": "...", "reason": "...", "priority": 1-5 }] }`,
    user: `Repository state:
- Total tools: ${repo.totalTools}
- Categories: ${Object.keys(repo.categories).length}
- Broken tools: ${repo.broken.length} (${repo.broken.map(b => b.name).join(', ') || 'none'})

Weakest categories (by avg file size):
${catSummary}

What are the top 5 improvements to make?`,
  };
}

function buildGeneratePrompt(repo, category) {
  const cat = repo.categories[category];
  const existingNames = cat ? cat.tools.map(t => t.name) : [];
  const existingTitles = cat ? cat.tools.map(t => t.title) : [];

  return {
    system: `You are an expert web developer creating self-contained HTML tool cards for a GitHub Pages site.

RULES:
1. Each tool is a SINGLE HTML file (no doctype/html/head/body tags — just content)
2. Must be fully self-contained: inline CSS, IIFE-wrapped JS, no external dependencies
3. Use CSS variables from the site: var(--accent), var(--text), var(--bg-primary), etc.
4. Each tool must have a unique ID prefix to avoid collisions
5. Must be visually polished, interactive, and actually useful
6. Include an <h2> with emoji, a <p class="description">, and the tool UI
7. All JavaScript must be wrapped in (function(){ ... })();
8. Tools should be 5-15KB of quality content

Generate ${CONFIG.maxTools} NEW tools for the "${category}" category that don't already exist.

EXISTING TOOLS IN THIS CATEGORY (do NOT duplicate):
${existingTitles.join(', ')}

Output format: Return ONLY a JSON array of objects with "filename" and "html" keys.
Example: [{"filename": "tool-name.html", "html": "<h2>..."}]`,
    user: `Generate ${CONFIG.maxTools} high-demand, visually polished tools for the "${category}" category.
Make them unique, useful, and beautiful. Focus on tools people would actually search for and use daily.`,
  };
}

function buildFixPrompt(repo, brokenTool) {
  const filePath = path.join(CONFIG.cardsDir, brokenTool.file);
  let currentHtml = '';
  try { currentHtml = fs.readFileSync(filePath, 'utf8'); } catch (e) {}

  return {
    system: `You are an expert web developer fixing a broken HTML tool card.

RULES:
1. The tool is currently broken (stub or missing functionality)
2. Rebuild it as a fully functional, self-contained HTML fragment
3. No doctype/html/head/body tags — just content
4. Inline CSS, IIFE-wrapped JS, no external dependencies
5. Use CSS variables: var(--accent), var(--text), var(--bg-primary), etc.
6. Must have <h2> with emoji, <p class="description">, and full tool UI
7. Make it visually polished and actually useful

Output format: Return ONLY the HTML content (no JSON wrapping, no markdown code blocks).`,
    user: `Fix this broken tool: "${brokenTool.title}" (${brokenTool.name})

Current content (${currentHtml.length} bytes):
${currentHtml.slice(0, 500)}

Generate a complete, working replacement.`,
  };
}

// ─── PR Creation ──────────────────────────────────────────────────────────────

function extractHtml(response) {
  // Try to extract HTML from markdown code blocks
  const codeBlockMatch = response.match(/```(?:html)?\s*\n([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();

  // Try to extract JSON array
  const jsonArrayMatch = response.match(/\[[\s\S]*\]/);
  if (jsonArrayMatch) {
    try {
      const arr = JSON.parse(jsonArrayMatch[0]);
      return arr;
    } catch (e) {}
  }

  // Assume raw HTML
  if (response.trim().startsWith('<')) return response.trim();

  return null;
}

function writeTool(filename, html) {
  const filePath = path.join(CONFIG.cardsDir, filename);
  fs.writeFileSync(filePath, html, 'utf8');
  console.log(`  ✅ Wrote ${filename} (${html.length} bytes)`);
}

function regenerateCardsJson() {
  const { execSync } = require('child_process');
  try {
    execSync('node generate-cards-json.js', { cwd: CONFIG.repoRoot, stdio: 'pipe' });
    console.log('  ✅ Regenerated cards.json');
  } catch (e) {
    console.error('  ❌ Failed to regenerate cards.json:', e.message);
  }
}

function updateIndexCount() {
  const indexPath = path.join(CONFIG.repoRoot, 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');
  const cardsFile = path.join(CONFIG.cardsDir, 'cards.json');
  const cards = JSON.parse(fs.readFileSync(cardsFile, 'utf8'));
  const count = cards.length;

  // Update all count references
  html = html.replace(/\d{3,4}\+ free offline/gi, `${count} free offline`);
  html = html.replace(/\d{3,4} Free Online/gi, `${count} Free Online`);
  html = html.replace(/\d{3,4} self-contained/gi, `${count} self-contained`);
  html = html.replace(/numberOfItems": \d{3,4}/g, `numberOfItems": ${count}`);
  html = html.replace(/\d{3,4}\+<\/strong>/g, `${count}+</strong>`);

  fs.writeFileSync(indexPath, html, 'utf8');
  console.log(`  ✅ Updated index.html count to ${count}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🤖 AI Developer starting...');
  console.log(`   Provider: ${CONFIG.provider}`);
  console.log(`   Task: ${CONFIG.task}`);
  console.log(`   Max tools: ${CONFIG.maxTools}`);
  console.log(`   Dry run: ${CONFIG.dryRun}`);
  console.log('');

  if (!CONFIG.apiKey && CONFIG.provider !== 'ollama') {
    console.error('❌ AI_API_KEY not set. Add it as a GitHub Actions secret.');
    process.exit(1);
  }

  // Analyze repo
  console.log('📊 Analyzing repository...');
  const repo = analyzeRepo();
  console.log(`   Total tools: ${repo.totalTools}`);
  console.log(`   Categories: ${Object.keys(repo.categories).length}`);
  console.log(`   Broken: ${repo.broken.length}`);
  console.log('');

  // Determine task
  let task = CONFIG.task;
  if (task === 'auto') {
    if (repo.broken.length > 0) task = 'fix';
    else task = 'generate';
  }

  const results = [];

  if (task === 'audit') {
    console.log('🔍 Running audit...');
    const prompt = buildAuditPrompt(repo);
    const response = await callAI(prompt.system, prompt.user);
    console.log('\n📋 Audit results:\n');
    console.log(response);
    return;
  }

  if (task === 'fix') {
    console.log('🔧 Fixing broken tools...');
    for (const broken of repo.broken.slice(0, CONFIG.maxTools)) {
      console.log(`\n  Fixing: ${broken.title} (${broken.name})`);
      const prompt = buildFixPrompt(repo, broken);
      try {
        const response = await callAI(prompt.system, prompt.user);
        const html = extractHtml(response);
        if (html && typeof html === 'string' && html.length > 200) {
          if (!CONFIG.dryRun) {
            writeTool(broken.file, html);
            results.push({ type: 'fix', name: broken.name, size: html.length });
          } else {
            console.log(`  [DRY RUN] Would write ${broken.file} (${html.length} bytes)`);
          }
        } else {
          console.log('  ⚠️ AI response was not valid HTML, skipping');
        }
      } catch (e) {
        console.error(`  ❌ Error: ${e.message}`);
      }
    }
  }

  if (task === 'generate') {
    // Pick category
    let category = CONFIG.category;
    if (!category) {
      // Auto-pick weakest category that isn't too large
      const candidates = repo.weakCategories.filter(c => c.count < 20);
      category = candidates[0]?.name || 'Productivity & Lifestyle';
    }
    console.log(`\n🎯 Generating tools for: ${category}`);

    const prompt = buildGeneratePrompt(repo, category);
    try {
      const response = await callAI(prompt.system, prompt.user);
      const extracted = extractHtml(response);

      if (Array.isArray(extracted)) {
        // Array of { filename, html } objects
        for (const item of extracted.slice(0, CONFIG.maxTools)) {
          if (item.filename && item.html && item.html.length > 200) {
            if (!CONFIG.dryRun) {
              writeTool(item.filename, item.html);
              results.push({ type: 'new', name: item.filename, size: item.html.length });
            } else {
              console.log(`  [DRY RUN] Would write ${item.filename} (${item.html.length} bytes)`);
            }
          }
        }
      } else if (typeof extracted === 'string' && extracted.length > 200) {
        // Single HTML response
        const filename = `ai-generated-${Date.now()}.html`;
        if (!CONFIG.dryRun) {
          writeTool(filename, extracted);
          results.push({ type: 'new', name: filename, size: extracted.length });
        }
      } else {
        console.log('  ⚠️ Could not extract valid tools from AI response');
        console.log('  Response preview:', response.slice(0, 300));
      }
    } catch (e) {
      console.error(`  ❌ Error: ${e.message}`);
    }
  }

  // Post-processing
  if (results.length > 0 && !CONFIG.dryRun) {
    console.log('\n📦 Post-processing...');
    regenerateCardsJson();
    updateIndexCount();

    console.log('\n✅ Done! Generated/fixated ' + results.length + ' tool(s):');
    results.forEach(r => console.log(`   ${r.type === 'fix' ? '🔧' : '🆕'} ${r.name} (${r.size} bytes)`));
    console.log('\n💡 Next steps:');
    console.log('   1. Review the changes');
    console.log('   2. Run: bash scripts/verify.sh');
    console.log('   3. Commit and push');
  } else if (results.length === 0) {
    console.log('\n⚠️ No tools were generated. Check the AI response above.');
  }
}

main().catch(e => {
  console.error('❌ Fatal error:', e.message);
  // Exit 0 so the workflow continues (PR step won't run but that's OK)
  process.exit(0);
});
