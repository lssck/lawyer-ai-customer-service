/**
 * Cloudflare Pages Function - 律师AI客服聊天接口
 * 路径: /api/chat (POST)
 *
 * 与 Vercel 版 api/chat.js 功能完全一致，
 * 但使用 Cloudflare Pages Functions 的 export 语法。
 */

// === 加载系统提示词（构建时嵌入） ===
// Cloudflare Pages Functions 无法直接读文件系统，
// 因此在构建前通过 build script 将 skill.md 和 knowledge-base.md 嵌入。
import { SKILL_MD, KNOWLEDGE_BASE_MD } from '../prompts.js';

function buildSystemPrompt(lawyerContext) {
  let prompt = SKILL_MD || '你是一位专业律师的前端客服助手。请倾听客户问题，提供初步法律分析，引导面谈。不承诺结果，不提供确定性法律意见。';
  if (KNOWLEDGE_BASE_MD) {
    prompt += '\n\n---\n\n【专业知识库】\n' + KNOWLEDGE_BASE_MD;
  }
  if (lawyerContext) {
    prompt += '\n\n' + lawyerContext;
  }
  return prompt;
}

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { message, conversation_id, lawyer_name, lawyer_field, lawyer_contact } = body;

    if (!message || !message.trim()) {
      return new Response(JSON.stringify({ error: '消息不能为空' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const apiKey = env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({
        error: 'API Key未配置',
        reply: '服务尚未配置完成，请联系管理员。'
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 构建律师信息上下文
    const lawyerContext = `【当前律师信息】律师名称：${lawyer_name || '李颖翔律师'}，专长：${lawyer_field || '企业法律风险防控、企业收并购尽职调查、公司年度法律顾问'}，联系方式：${lawyer_contact || '邮箱：27182836@qq.com'}`;

    // 构建 API 请求消息
    const userMessage = { role: 'user', content: message };
    const apiMessages = [
      { role: 'system', content: buildSystemPrompt(lawyerContext) },
      userMessage
    ];

    const model = env.MODEL || 'deepseek-chat';

    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: apiMessages,
        temperature: 0.7,
        max_tokens: 1024
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[API Error] ${response.status}: ${errorText}`);
      return new Response(JSON.stringify({
        error: 'LLM API调用失败',
        reply: 'AI服务暂时不可用，请稍后重试。'
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || '抱歉，暂时无法回答。请稍后再试。';

    const sessionId = conversation_id || ('sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8));

    return new Response(JSON.stringify({
      reply,
      conversation_id: sessionId
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[Server Error]', err.message);
    return new Response(JSON.stringify({
      error: '服务器内部错误',
      reply: '服务暂时异常，请稍后重试。'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// 处理 OPTIONS 预检请求（CORS）
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
