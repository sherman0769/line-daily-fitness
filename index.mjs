// index.mjs  —— Gemini 版本（純文字輸出）
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

// ---- Variation helpers ----
import fs from 'node:fs';

const WEEK_THEMES = [
  '補水與代謝',        // 週日(0)
  '關節伸展與姿勢',    // 週一
  '核心啟動與坐姿',    // 週二
  '下半身力量與深蹲',  // 週三
  '呼吸放鬆與睡眠',    // 週四
  '心肺活化與步行',    // 週五
  '周末恢復與低強度'   // 週六
];

const CTA_VARIANTS = [
  '現在就開始行動吧！ 💯🚀',
  '把好習慣從今天開始！ ✅',
  '給自己 5 分鐘，立刻動起來！ ⏱️',
  '小步快走，持續最重要！ 🏁'
];

const LINE_API = 'https://api.line.me/v2/bot/message/push';
const GEMINI_RETRY_DELAYS_MS = [5000, 15000, 30000];
const RETRYABLE_GEMINI_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getErrorSummary(e) {
  const status = e?.status ?? e?.statusCode ?? e?.code ?? e?.response?.status;
  const message = e?.message || String(e);
  return status ? `${status} ${message}` : message;
}

function isRetryableGeminiError(e) {
  const status = e?.status ?? e?.statusCode ?? e?.code ?? e?.response?.status;
  const numericStatus = typeof status === 'string' ? Number(status) : status;
  const message = e?.message || String(e);

  return RETRYABLE_GEMINI_STATUS_CODES.has(numericStatus)
    || /high demand|UNAVAILABLE|temporarily unavailable/i.test(message);
}

async function generateContentWithRetry(ai, request) {
  for (let attempt = 0; attempt <= GEMINI_RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await ai.models.generateContent(request);
    } catch (e) {
      const canRetry = isRetryableGeminiError(e);
      if (!canRetry || attempt === GEMINI_RETRY_DELAYS_MS.length) {
        throw e;
      }

      const delayMs = GEMINI_RETRY_DELAYS_MS[attempt];
      console.warn(
        `Gemini 暫時失敗，準備第 ${attempt + 1}/${GEMINI_RETRY_DELAYS_MS.length} 次重試，等待 ${delayMs / 1000} 秒：${getErrorSummary(e)}`
      );
      await sleep(delayMs);
    }
  }
}

function getWeekTheme(date = new Date()) {
  const d = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  return WEEK_THEMES[d.getDay()];
}

function pickCTA() {
  return CTA_VARIANTS[Math.floor(Math.random() * CTA_VARIANTS.length)];
}

// 以三字詞 Jaccard 判斷是否太相似
function trigramSet(s) {
  const t = s.replace(/\s+/g, '').slice(0, 600); // 限前600字避免太長
  const arr = [];
  for (let i = 0; i < t.length - 2; i++) arr.push(t.slice(i, i + 3));
  return new Set(arr);
}
function similarity(a, b) {
  const A = trigramSet(a), B = trigramSet(b);
  const inter = [...A].filter(x => B.has(x)).length;
  const union = new Set([...A, ...B]).size;
  return union ? inter / union : 0;
}

// 最近歷史（存到本機；之後可改為 GitHub Actions 提交回 repo）
const HISTORY_PATH = './history.json';
function loadHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8')); }
  catch { return []; }
}
function saveHistory(arr) {
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(arr.slice(-7), null, 2), 'utf8'); // 只保留最近7次
}

function twDateStr(d = new Date()) {
  const parts = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(d);
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const dd = parts.find(p => p.type === 'day').value;
  return `${y}年${m}月${dd}日`;
}

function buildGeminiFallbackPost(dateStr = twDateStr()) {
  return `🌟 Li's Meet Pro 每日健身小提醒｜${dateStr}
· · · · ·

今天健身提醒服務暫時忙碌，先做一件最簡單的事：起身走動 3 分鐘、喝一杯水、做三次深呼吸。

你的專屬教練 李詩民 提醒您。
預約與補課系統 👉 https://lms-booking-pro-5467.vercel.app/`;
}

async function generatePost() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('缺少 GEMINI_API_KEY');

  const ai = new GoogleGenAI({ apiKey });

  const dateStr = twDateStr();
  const theme = getWeekTheme();
  const cta = pickCTA();

  const prompt = `
你是一位專業健身教練，輸出繁體中文、適合一般人、生活化，避免專業術語。
【今日主題】${theme}

請只輸出純文字，嚴格遵守以下格式（不要多餘空白行）：

🌟 Li's Meet Pro 每日健身小提醒｜${dateStr}
 
1️⃣ 標題句（8~14字，與「${theme}」呼應） 😌/🔥/💪
• 子彈點1（≤18字）
• 子彈點2（≤18字）
• 子彈點3（可選，≤18字）
2️⃣ 標題句（8~14字，與「${theme}」不同面向） 🚶‍♀️/🧘/🏃
• 子彈點1（≤18字）
• 子彈點2（≤18字）
• 子彈點3（可選，≤18字）
 
${cta}
你的專屬教練 李詩民 提醒您。
預約與補課系統 👉 https://lms-booking-pro-5467.vercel.app/

【規則】
- 兩段主題要彼此不同面向；用詞避免與最近幾天重複。
- 第二行分隔使用「· · · · ·」。
- 全文不得插入空白行；每條 ≤ 18 字；emoji 精簡。
`.trim();

  const resp = await generateContentWithRetry(ai, {
    model: 'gemini-2.5-flash',
    contents: prompt,
  });

  const text = resp.text?.trim();
  if (!text) throw new Error('Gemini 無內容回傳');
  return text;
}

async function pushToLine(text) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const groupId = process.env.LINE_GROUP_ID;
  if (!token || !groupId) throw new Error('缺少 LINE_CHANNEL_ACCESS_TOKEN 或 LINE_GROUP_ID');

  const body = {
    to: groupId,
    messages: [{ type: 'text', text }]
  };

  const res = await fetch(LINE_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LINE Push API 錯誤：${res.status} ${errText}`);
  }
}

(async () => {
  try {
    const history = loadHistory();
    let post;
    let tries = 1;
    let shouldSaveHistory = true;

    try {
      post = await generatePost();

      // 若與歷史任一篇相似度 > 0.80，最多重生2次
      while (tries <= 2) {
        const maxSim = Math.max(0, ...history.map(h => similarity(post, h.text || h)));
        if (maxSim <= 0.80) break;
        post = await generatePost();
        tries++;
      }
    } catch (e) {
      if (!isRetryableGeminiError(e)) {
        throw e;
      }

      console.error('Gemini 重試後仍暫時失敗，改送 LINE 備援訊息：', getErrorSummary(e));
      post = buildGeminiFallbackPost();
      shouldSaveHistory = false;
    }

    await pushToLine(post);

    // 記錄歷史；Gemini 暫時失敗時的備援訊息不寫入歷史，避免影響後續相似度
    if (shouldSaveHistory) {
      history.push({ date: twDateStr(), text: post });
      saveHistory(history);
    }

    console.log('✅ 已推送到群組（相似度檢查嘗試次數：', tries, '）');
  } catch (e) {
    console.error('❌ 執行失敗：', e);
    process.exit(1);
  }
})();
