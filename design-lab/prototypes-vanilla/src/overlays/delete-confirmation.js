import { getDeleteImpact } from '../privacy/models.js';
import { escapeHtml } from '../components/primitives.js';

export function renderDeleteConfirmation(targetId) {
  const impact = getDeleteImpact(targetId);
  return `<section class="delete-confirmation spatial-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-title">
    <button class="overlay-scrim" type="button" data-action="close-overlay" aria-label="取消删除"></button>
    <article class="delete-confirmation__panel">
      <p class="eyebrow">最后确认 · 可恢复原件</p><h2 id="delete-title">移出 ${escapeHtml(impact.target.label)}？</h2><p>这会从 Elsewhere 当前视图移出这段旅程的索引和派生关系；Firebase Storage 中的原件字节继续保留。</p>
      <dl><div><dt>场景</dt><dd>${impact.scenes.length}</dd></div><div><dt>连接</dt><dd>${impact.connections.length}</dd></div><div><dt>发现</dt><dd>${impact.discoveries.length}</dd></div><div><dt>书写</dt><dd>${impact.userNotes.length}</dd></div></dl>
      <label class="delete-ack"><input type="checkbox" data-store-action="delete-ack"><span>我理解这会持久化移出选择，但不会删除 Storage 原件。</span></label>
      <div><button type="button" data-action="close-overlay">取消</button><button class="danger-action" type="button" data-action="confirm-delete" data-target-id="${escapeHtml(targetId)}" disabled>移出这段旅程</button></div>
    </article>
  </section>`;
}
