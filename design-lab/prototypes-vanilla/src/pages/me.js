import { store } from "../store.js";

// Global action handler for offline download JSON backup
window.triggerOfflineExportBackup = () => {
  const backupData = {
    timestamp: new Date().toISOString(),
    world: store.state.cities,
    fragments: store.state.fragments,
    discoveries: store.state.discoveries,
    userNotes: store.state.userNotes,
    settings: store.state.settings,
    elseState: store.state.elseState
  };
  const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `elsewhere-archive-backup-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Show toast notification
  const toast = document.createElement("div");
  toast.className = "fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 bg-stone-900 border border-stone-800 text-amber-500 rounded-full text-xs font-mono tracking-wider z-[9999] shadow-2xl animate-fade-in";
  toast.innerText = "✓ OFFLINE BACKUP EXPORTED (.JSON)";
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
};

window.triggerResetLocalAction = () => {
  if (confirm("⚠️ 确定要擦除本地所有已整理和校准的旅行事实吗？此操作将使状态归零，但不会影响本地初始数据恢复。")) {
    window.resetLocalData();
    const toast = document.createElement("div");
    toast.className = "fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 bg-stone-900 border border-stone-850 text-red-400 rounded-full text-xs font-mono tracking-wider z-[9999] shadow-2xl animate-fade-in";
    toast.innerText = "✓ LOCAL DATA RESET SUCCESSFUL";
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  }
};

window.triggerRestoreDefaultAction = () => {
  window.restoreDefaultData();
  const toast = document.createElement("div");
  toast.className = "fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 bg-stone-900 border border-stone-850 text-green-500 rounded-full text-xs font-mono tracking-wider z-[9999] shadow-2xl animate-fade-in";
  toast.innerText = "✓ DEFAULT TRIP DATA RESTORED";
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
};

window.saveNoteDetailAction = (id) => {
  const textVal = document.getElementById("note-edit-textarea")?.value;
  const note = store.state.userNotes.find(n => n.id === id);
  if (note) {
    store.updateNote(id, textVal);
    const toast = document.createElement("div");
    toast.className = "fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 bg-stone-900 border border-stone-800 text-amber-500 rounded-full text-xs font-mono tracking-wider z-[9999] shadow-2xl animate-fade-in";
    toast.innerText = "✓ WRITING SAVED SUCCESSFULLY";
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.remove();
      window.location.hash = "#/me/writing";
    }, 1500);
  }
};

window.deleteNoteAction = (id) => {
  if (confirm("⚠️ 确定要永久删除这篇私人随笔吗？此操作不可撤销。")) {
    store.state.userNotes = store.state.userNotes.filter(n => n.id !== id);
    store.notify();
    const toast = document.createElement("div");
    toast.className = "fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 bg-stone-900 border border-stone-800 text-red-400 rounded-full text-xs font-mono tracking-wider z-[9999] shadow-2xl animate-fade-in";
    toast.innerText = "✓ WRITING DELETED";
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.remove();
      window.location.hash = "#/me/writing";
    }, 1200);
  }
};

window.createNewNoteAction = () => {
  const text = "在新的这一天里，我写下新的思考...";
  store.addNote(text, []);
  const newNote = store.state.userNotes[0];
  window.location.hash = `#/me/writing/${newNote.id}`;
};

export function renderMePage(route, state) {
  const pageId = route.pageId;
  const params = route.params || {};

  // SUBVIEW 1: me-writing (我的随笔列表)
  if (pageId === "me-writing") {
    const notesHtml = state.userNotes.length === 0
      ? `
        <div class="p-8 text-center bg-stone-950/20 border border-stone-900 border-dashed rounded-2xl">
          <p class="text-xs text-stone-500">这里还没有写过任何旅行反思，去场景或发现中留下你的第一笔吧。</p>
        </div>
      `
      : state.userNotes.map(n => {
          let relLabel = "散落粒子";
          if (n.related && n.related.length > 0) {
            relLabel = n.related.map(r => r.toUpperCase()).join(", ");
          }
          return `
            <div class="archive-card p-4 bg-stone-950 border border-stone-900 rounded-xl space-y-2.5 hover:border-amber-500/20 transition-all cursor-pointer"
                 onclick="window.location.hash='#/me/writing/${n.id}'">
              <div class="flex justify-between items-center text-[10px] font-mono text-stone-500">
                <span>${n.createdAt || "DRAFT"}</span>
                <span class="px-1.5 py-0.2 rounded bg-stone-900 border border-stone-800 text-stone-400 font-sans text-[9px] uppercase">${n.status || "private"}</span>
              </div>
              <p class="text-xs text-stone-200 font-serif leading-relaxed italic line-clamp-3">"${n.text}"</p>
              <div class="text-[9px] font-mono text-stone-500">关联实体: <span class="text-stone-400">${relLabel}</span></div>
            </div>
          `;
        }).join("");

    return `
      <div class="p-6 space-y-5 fade-in text-stone-200 pb-28">
        <div class="flex items-center gap-3">
          <a href="#/me" class="p-1 rounded hover:bg-stone-850 text-stone-400 hover:text-white transition-colors">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7" />
            </svg>
          </a>
          <div>
            <span class="text-[9px] font-mono tracking-widest text-stone-500 uppercase">My Private Sphere</span>
            <h1 class="text-2xl font-display font-medium text-white mt-0.5">我的全部随笔</h1>
          </div>
        </div>

        <p class="text-xs text-stone-400 leading-relaxed font-sans">
          这里集中保存着您在不同的城市、场景微景或发现线索中，手动写下的个人心境随笔。系统承诺这些文字完全保存在您自己的本地设备中。
        </p>

        <button onclick="window.createNewNoteAction()"
                class="w-full py-2.5 rounded-xl border border-stone-800 bg-stone-900 text-stone-300 hover:bg-stone-850 hover:text-white text-xs font-sans font-semibold uppercase tracking-wider transition-all text-center">
          + 新增一篇私人随笔
        </button>

        <div class="space-y-4 pt-1">
          ${notesHtml}
        </div>
      </div>
    `;
  }

  // SUBVIEW 2: me-writing-detail (随笔编辑器)
  if (pageId === "me-writing-detail") {
    const noteId = params.id;
    const note = state.userNotes.find(n => n.id === noteId);

    if (!note) {
      return `
        <div class="p-6 text-center space-y-4 fade-in text-stone-400 pb-28">
          <p class="text-xs">未找到该随笔记录。</p>
          <a href="#/me/writing" class="text-xs text-amber-500 underline">返回列表</a>
        </div>
      `;
    }

    return `
      <div class="p-6 space-y-5 fade-in text-stone-200 pb-28">
        <div class="flex items-center gap-3">
          <a href="#/me/writing" class="p-1 rounded hover:bg-stone-850 text-stone-400 hover:text-white transition-colors">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7" />
            </svg>
          </a>
          <div>
            <span class="text-[9px] font-mono tracking-widest text-stone-500 uppercase">Edit Reflection</span>
            <h1 class="text-xl font-display font-medium text-white mt-0.5">编辑私人随笔</h1>
          </div>
        </div>

        <div class="p-5 bg-stone-950 border border-stone-900 rounded-2xl space-y-4">
          <div class="flex justify-between items-center text-[10px] font-mono text-stone-500">
            <span>创建于: ${note.createdAt || "DRAFT"}</span>
            <span>类型: ${note.type || "scene_note"}</span>
          </div>

          <div class="space-y-1.5">
            <label class="text-[9px] font-mono text-stone-500 uppercase tracking-widest block">正文内容</label>
            <textarea id="note-edit-textarea" 
                      class="w-full bg-stone-900/60 border border-stone-850 rounded-xl p-3.5 text-xs text-stone-100 font-serif min-h-[220px] focus:outline-none focus:border-amber-500/30 leading-relaxed select-text" 
                      placeholder="写下只属于你个人的回忆...">${note.text || ""}</textarea>
          </div>

          <div class="grid grid-cols-2 gap-3 pt-2">
            <button onclick="window.saveNoteDetailAction('${note.id}')"
                    class="py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-sans font-semibold text-xs tracking-wider transition-colors uppercase text-center">
              保存修改
            </button>
            <button onclick="window.deleteNoteAction('${note.id}')"
                    class="py-3 rounded-xl border border-red-500/20 bg-red-500/[0.01] text-red-400/90 hover:bg-red-500/[0.04] text-xs font-mono transition-colors uppercase tracking-wider text-center">
              删除此随笔
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // SUBVIEW 3: me-home (Settings & Profile 主面板)
  const savedDiscoveriesCount = state.discoveries.filter(d => d.status === "saved").length;
  const userNotesCount = state.userNotes.length;

  return `
    <div class="p-6 space-y-6 fade-in text-stone-200 pb-28">
      <!-- Page Title -->
      <div>
        <span class="text-[9px] font-mono tracking-widest text-stone-500 uppercase">Archive Sovereignty</span>
        <h1 class="text-2xl font-display font-medium text-white mt-0.5">我的私人空间</h1>
      </div>

      <p class="text-[13px] text-stone-400 font-sans leading-relaxed select-text">
        欢迎回到 Elsewhere 物理档案馆的控制中心。这里保存着您所有的解构事实、已确认的时空线索及个人思考笔迹。数据完全存储于您本地的沙盒中，绝对安全，离线运行。
      </p>

      <!-- 1. 唯一城市档案 (City Profile Card) -->
      <div class="space-y-2">
        <span class="text-[8px] font-mono text-stone-500 uppercase tracking-widest block">✦ 城市回忆档案 (City Archive Profile)</span>
        <div class="archive-card p-5 bg-stone-950 border border-stone-900 rounded-2xl relative overflow-hidden">
          <div class="absolute right-4 top-4 font-serif italic text-3xl text-stone-900 pointer-events-none uppercase font-bold">PROFILE</div>
          <div class="space-y-3.5 relative z-10">
            <div>
              <span class="px-2 py-0.5 rounded bg-amber-500/10 text-[9px] font-mono text-amber-500 border border-amber-500/20 uppercase">Active Identity</span>
              <h3 class="text-base font-medium text-white mt-1.5 font-sans">旅行档案所有者</h3>
            </div>
            
            <div class="grid grid-cols-2 gap-4 border-t border-stone-900/60 pt-3">
              <div>
                <span class="text-[9.5px] font-mono text-stone-500 block">已对齐足迹</span>
                <span class="text-xs text-stone-300 font-medium">3 处旅行地 (曼谷/清迈/东京)</span>
              </div>
              <div>
                <span class="text-[9.5px] font-mono text-stone-500 block">库中原件总数</span>
                <span class="text-xs text-stone-300 font-medium">${state.fragments.length} 个原始碎片</span>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4 border-t border-stone-900/60 pt-3">
              <div>
                <span class="text-[9.5px] font-mono text-stone-500 block">显影对齐线索</span>
                <span class="text-xs text-stone-300 font-medium">${savedDiscoveriesCount} 条已命名记忆</span>
              </div>
              <div>
                <span class="text-[9.5px] font-mono text-stone-500 block">私人随感随笔</span>
                <span class="text-xs text-stone-300 font-medium">${userNotesCount} 篇手写随笔</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 2. 私人随感随笔入口 (My Writings Navigation Entrance) -->
      <div class="space-y-2">
        <span class="text-[8px] font-mono text-stone-500 uppercase tracking-widest block">✍️ 我的私人写作 (Personal Reflections)</span>
        <div onclick="window.location.hash='#/me/writing'"
             class="p-4 bg-stone-950 border border-stone-900 rounded-2xl hover:border-amber-500/20 transition-all flex items-center justify-between cursor-pointer group">
          <div class="space-y-1">
            <h4 class="text-xs font-sans text-stone-200">管理我的全部旅行随笔</h4>
            <p class="text-[11px] text-stone-500 font-sans leading-relaxed">查看、编辑或删除您手写的所有日常记录与感悟（已存 ${userNotesCount} 篇）</p>
          </div>
          <div class="text-[11px] font-mono text-stone-600 group-hover:text-amber-500 transition-colors flex items-center gap-1">
            进入写作库 
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>

      <!-- 3. 离线备份导出 (Single Action Backup) -->
      <div class="space-y-2.5">
        <span class="text-[8px] font-mono text-stone-500 uppercase tracking-widest block">💾 本地数据安全与导出 (Data Portability)</span>
        <div class="p-5 bg-stone-950 border border-stone-900 rounded-2xl space-y-4">
          <p class="text-xs text-stone-400 leading-relaxed font-sans">
            将您本设备中所有解构出来的城市、碎片的拓扑连接、线索分析及私人笔记一键备份为通用 JSON 格式，可随时在其他设备上恢复导入，真正实现数据回忆主权。
          </p>
          <button onclick="window.triggerOfflineExportBackup()"
                  class="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-sans font-semibold text-xs tracking-wider transition-all uppercase text-center shadow-lg">
            一键导出离线 JSON 备份 (.JSON)
          </button>
        </div>
      </div>

      <!-- 4. 本地存储管理及两个重置按钮 (Storage Reset Actions) -->
      <div class="space-y-2.5">
        <span class="text-[8px] font-mono text-stone-500 uppercase tracking-widest block">⚙️ 数据库安全抹除与初始化 (Storage Settings)</span>
        <div class="p-5 bg-stone-950 border border-stone-900 rounded-2xl space-y-4">
          <div class="flex justify-between items-center border-b border-stone-900 pb-3">
            <span class="text-xs text-stone-400">IndexedDB 沙盒状态</span>
            <span class="text-xs font-mono text-amber-500">12.4 KB (离线占用)</span>
          </div>
          
          <p class="text-[11px] text-stone-500 leading-relaxed font-sans">
            重置本地数据可清空全部手记 and 自定义对齐连线状态，使其归于纯净白板。若要重温初始精心预设的曼谷咖啡馆、昭披耶河黄昏渡轮及新宿居酒屋的时空叙事结构，可一键恢复默认数据集。
          </p>

          <div class="grid grid-cols-2 gap-3 pt-1">
            <!-- Button 1: 重置本地数据 -->
            <button onclick="window.triggerResetLocalAction()"
                    class="py-3 rounded-xl border border-dashed border-red-500/20 bg-red-500/[0.02] text-red-400/90 hover:bg-red-500/[0.05] text-xs font-mono transition-colors uppercase tracking-wider text-center">
              重置本地数据
            </button>
            
            <!-- Button 2: 恢复默认数据 -->
            <button onclick="window.triggerRestoreDefaultAction()"
                    class="py-3 rounded-xl border border-stone-850 bg-stone-900 text-stone-300 hover:bg-stone-850 text-xs font-mono transition-colors uppercase tracking-wider text-center">
              恢复默认数据
            </button>
          </div>
        </div>
      </div>

    </div>
  `;
}
