// index.mjs  —— Gemini 版本（純文字輸出）
import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

const LINE_API = 'https://api.line.me/v2/bot/message/push';

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

async function generatePost() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('缺少 GEMINI_API_KEY');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });

  const dateStr = twDateStr();
  const prompt = `
你是一位專業健身教練，每天提供精煉、實用且適合一般人的健身提醒：
- 產出兩則提醒，每則50-100字、生活化、含emoji、避免專業術語、繁體中文。
- 最後加入固定結尾與連結。
請只輸出純文字，格式如下：

標題：Li's Meet Pro 每日健身小提醒｜${dateStr}
1️⃣ 第一則提醒（50-100字，含emoji）
2️⃣ 第二則提醒（50-100字，含emoji）
結尾：現在就開始行動吧！  💯🚀你的專屬教練 李詩民 提醒您。
預約與補課系統點擊
https://lms-booking-pro-5467.vercel.app/
  `.trim();

  const result = await model.generateContent(prompt);
  const text = result.response?.text?.();
  if (!text) throw new Error('Gemini 無內容回傳');
  return text.trim();
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
    const post = await generatePost();
    await pushToLine(post);
    console.log('✅ 已推送到群組');
  } catch (e) {
    console.error('❌ 執行失敗：', e);
    process.exit(1);
  }
})();
