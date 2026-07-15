/**
 * 全部运行时配置。模型 ID 只允许出现在这里（经环境变量注入），
 * 业务代码只使用别名（总架构 §6）。
 */
export const config = {
  port: Number(process.env.PORT || 8787),
  apiKey: process.env.GEMINI_API_KEY || '',
  useVertex: process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true',
  vertexProject: process.env.GOOGLE_CLOUD_PROJECT || '',
  vertexLocation: process.env.GOOGLE_CLOUD_LOCATION || 'global',
  models: {
    FAST_MULTIMODAL: process.env.ELSE_MODEL_FAST || 'gemini-flash-latest',
    // 生产环境请指向 Pro 级模型；未配置时与 FAST 同源，保证服务可用
    DEEP_REASONING: process.env.ELSE_MODEL_DEEP || process.env.ELSE_MODEL_FAST || 'gemini-flash-latest',
  },
  corsOrigin: process.env.ELSE_CORS_ORIGIN || '*',
  evidenceLimit: 40,
  maxQuestionLength: 500,
};

export const hasCredentials = () => Boolean(config.apiKey || (config.useVertex && config.vertexProject));
