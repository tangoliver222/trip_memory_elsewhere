import { getDeleteImpact } from '../privacy/models.js';
import { escapeHtml } from '../components/primitives.js';

export function renderDeleteConfirmation(targetId) {
  const impact = getDeleteImpact(targetId);
  return `<section class="delete-confirmation spatial-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-title">
    <button class="overlay-scrim" type="button" data-action="close-overlay" aria-label="取消删除"></button>
    <article class="delete-confirmation__panel">
      <p class="eyebrow">最后确认 · 不可撤销</p><h2 id="delete-title">删除 ${escapeHtml(impact.target.label)}？</h2><p>这会移除这段旅程在 Elsewhere 中的原件索引、场景、地点关系、连接、发现、City Capsule 与相关书写。</p>
      <dl><div><dt>场景</dt><dd>${impact.scenes.length}</dd></div><div><dt>连接</dt><dd>${impact.connections.length}</dd></div><div><dt>发现</dt><dd>${impact.discoveries.length}</dd></div><div><dt>书写</dt><dd>${impact.userNotes.length}</dd></div></dl>
      <label class="delete-ack"><input type="checkbox" data-delete-ack><span>我理解删除影响。当前原型会记录选择，不会删除磁盘文件。</span></label>
      <div><button type="button" data-action="close-overlay">取消</button><button class="danger-action" type="button" data-action="confirm-delete" data-target-id="${escapeHtml(targetId)}">删除这段旅程</button></div>
    </article>
  </section>`;
}
