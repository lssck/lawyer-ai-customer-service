const fs = require('fs');
const path = require('path');

// === 加载 skill.md ===
const SKILL_PATH = path.join(__dirname, '..', 'skill.md');
let SYSTEM_PROMPT = '';
try {
  SYSTEM_PROMPT = fs.readFileSync(SKILL_PATH, 'utf-8');
} catch (err) {
  SYSTEM_PROMPT = '你是一位专业律师的前端客服助手。请倾听客户问题，提供初步法律分析，引导面谈。不承诺结果，不提供确定性法律意见。';
}

// === 加载 knowledge-base.md ===
const KB_PATH = path.join(__dirname, '..', 'knowledge-base.md');
let KNOWLEDGE_BASE = '';
try {
  KNOWLEDGE_BASE = fs.readFileSync(KB_PATH, 'utf-8');
} catch (err) {
  KNOWLEDGE_BASE = '';
}

// === 组合系统提示词 ===
function buildSystemPrompt(lawyerContext) {
  let prompt = SYSTEM_PROMPT;
  if (KNOWLEDGE_BASE) {
    prompt += '\n\n---\n\n【专业知识库】\n' + KNOWLEDGE_BASE;
  }
  if (lawyerContext) {
    prompt += '\n\n' + lawyerContext;
  }
  return prompt;
}

// === DeepSeek 配置 ===
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const MODEL = process.env.MODEL || 'deepseek-chat';

// === 会话存储（Vercel Serverless 用内存，生产建议接Redis） ===
const sessions = new Map();

module.exports = async (req, res) => {
  // 只接受 POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message, conversation_id, lawyer_name, lawyer_field, lawyer_contact } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: '消息不能为空' });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: 'API Key未配置',
      reply: '服务尚未配置完成，请联系管理员。'
    });
  }

  // 获取或创建会话
  let session;
  if (conversation_id) {
    session = sessions.get(conversation_id);
  }
  if (!session) {
    const id = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    session = { id, messages: [], lastActive: Date.now() };
    sessions.set(id, session);
  }
  session.lastActive = Date.now();

  // 构建律师信息上下文
  const lawyerContext = `【当前律师信息】律师名称：${lawyer_name || 'XX律师'}，专长：${lawyer_field || '民商事、知识产权、公司商事'}，联系方式：${lawyer_contact || '暂未设置'}`;

  // 添加用户消息
  session.messages.push({ role: 'user', content: message });

  // 构建 API 请求消息
  const apiMessages = [
    { role: 'system', content: buildSystemPrompt(lawyerContext) },
    ...session.messages.slice(-20)
  ];

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: apiMessages,
        temperature: 0.7,
        max_tokens: 1024
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[API Error] ${response.status}: ${errorText}`);
      return res.status(502).json({
        error: 'LLM API调用失败',
        reply: 'AI服务暂时不可用，请稍后重试。'
      });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || '抱歉，暂时无法回答。请稍后再试。';

    session.messages.push({ role: 'assistant', content: reply });
    if (session.messages.length > 40) {
      session.messages = session.messages.slice(-30);
    }

    return res.status(200).json({
      reply,
      conversation_id: session.id
    });

  } catch (err) {
    console.error('[Server Error]', err.message);
    return res.status(500).json({
      error: '服务器内部错误',
      reply: '服务暂时异常，请稍后重试。'
    });
  }
};
