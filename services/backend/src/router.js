/**
 * Query Router（总架构 §10.5）：
 * 跨对象 / 冲突 / 规律类问题或大证据包 → DEEP_REASONING，其余 FAST_MULTIMODAL。
 */
const DEEP_PATTERN = /为什么|冲突|矛盾|对比|比较|规律|模式|总结|回顾|跨旅程|跨城市|变化|所有.*(城市|旅程)|哪些年/;

export function pickAlias(question = '', evidenceCount = 0) {
  if (DEEP_PATTERN.test(question) || evidenceCount > 25 || question.length > 60) return 'DEEP_REASONING';
  return 'FAST_MULTIMODAL';
}
