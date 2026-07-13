import { store } from "../store.js";

export function renderMePage(route, state) {
  const pageId = route.pageId;
  const params = route.params || {};

  // HELPER to draw settings item toggle
  function renderSettingsToggle(label, desc, key, stateVal) {
    window.toggleSettingGlobal = (k, current) => {
      store.updateSetting(k, !current);
    };

    return `
      <div class="flex items-center justify-between p-4 bg-stone-900/60 border border-stone-850 rounded-xl">
        <div>
          <h4 class="text-sm font-medium text-white">${label}</h4>
          <p class="text-xs text-stone-500 mt-0.5">${desc}</p>
        </div>
        <input type="checkbox" ${stateVal ? 'checked' : ''} onchange="window.toggleSettingGlobal('${key}', ${stateVal})" class="accent-stone-200 w-5 h-5 cursor-pointer">
      </div>
    `;
  }

  // 1. ME HOME VIEW
  if (pageId === "me-home") {
    return `
      <div class="p-6 space-y-6 fade-in text-stone-200">
        <div>
          <span class="text-[10px] font-mono tracking-widest text-stone-500 uppercase">My Profile</span>
          <h1 class="text-2xl font-display font-medium text-white mt-1">我的空间</h1>
        </div>

        <!-- Stat Card -->
        <div class="grid grid-cols-2 gap-4">
          <div class="archive-card p-4">
            <span class="text-[10px] font-mono text-stone-500 block">对齐城市</span>
            <span class="text-xl font-display font-medium text-white mt-1">1 处</span>
            <span class="text-[10px] text-stone-500 block mt-1">Bangkok 曼谷</span>
          </div>

          <div class="archive-card p-4">
            <span class="text-[10px] font-mono text-stone-500 block">已写回忆</span>
            <span class="text-xl font-display font-medium text-white mt-1">${state.userNotes.length} 篇</span>
            <span class="text-[10px] text-amber-500 block mt-1">100% 本地保存</span>
          </div>
        </div>

        <!-- Navigation Menu Groups -->
        <div class="space-y-3">
          <h3 class="text-xs font-mono tracking-wider text-stone-500 uppercase">记忆与笔谈</h3>
          <div class="archive-card p-4 flex justify-between items-center" onclick="window.location.hash='#/me/writing'">
            <div>
              <h4 class="text-sm font-medium text-white">私人旅行随笔</h4>
              <p class="text-xs text-stone-500 mt-1">已记叙 ${state.userNotes.length} 个时刻的感悟</p>
            </div>
            <svg class="w-5 h-5 text-stone-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>

        <div class="space-y-3">
          <h3 class="text-xs font-mono tracking-wider text-stone-500 uppercase">设置与主权</h3>
          
          <div class="space-y-2">
            <div class="p-4 bg-stone-900 border border-stone-850 rounded-xl flex justify-between items-center" onclick="window.location.hash='#/me/privacy'">
              <span class="text-sm font-medium text-white">隐私与元数据保护</span>
              <svg class="w-4 h-4 text-stone-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </div>

            <div class="p-4 bg-stone-900 border border-stone-850 rounded-xl flex justify-between items-center" onclick="window.location.hash='#/me/preferences'">
              <span class="text-sm font-medium text-white">偏好设置</span>
              <svg class="w-4 h-4 text-stone-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </div>

            <div class="p-4 bg-stone-900 border border-stone-850 rounded-xl flex justify-between items-center" onclick="window.location.hash='#/me/storage'">
              <span class="text-sm font-medium text-white">存储状况</span>
              <svg class="w-4 h-4 text-stone-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </div>

            <div class="p-4 bg-stone-900 border border-stone-850 rounded-xl flex justify-between items-center" onclick="window.location.hash='#/me/export'">
              <span class="text-sm font-medium text-amber-500/90">数据备份与导出</span>
              <svg class="w-4 h-4 text-stone-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // 2. ME WRITINGS LIST
  if (pageId === "me-writing") {
    return `
      <div class="p-6 space-y-6 fade-in text-stone-200">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <a href="#/me" class="p-1 rounded hover:bg-stone-800 text-stone-400 hover:text-white">
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
              </svg>
            </a>
            <h1 class="text-xl font-display font-medium text-white">私人旅行随笔</h1>
          </div>
          <button class="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-amber-500/90 text-xs font-mono border border-stone-700/60 transition-all flex items-center gap-1" onclick="window.location.hash='#/me/writing/new'">
            + 新增笔谈
          </button>
        </div>

        <div class="space-y-4">
          ${state.userNotes.map(note => `
            <div class="archive-card p-4 space-y-2 cursor-pointer" onclick="window.location.hash='#/me/writing/${note.id}'">
              <div class="flex justify-between text-[10px] font-mono text-stone-500">
                <span>${note.createdAt || 'DRAFT'}</span>
                <span class="text-amber-500">${note.status ? note.status.toUpperCase() : 'PRIVATE'}</span>
              </div>
              <p class="text-sm text-stone-300 font-serif line-clamp-3 leading-relaxed">
                "${note.text}"
              </p>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // 3. ME WRITING DETAIL (EDITOR SKELETON)
  if (pageId === "me-writing-detail") {
    const noteId = params.id;
    const isNew = noteId === "new";
    const note = isNew ? { text: "", createdAt: new Date().toISOString().split("T")[0] } : (state.userNotes.find(n => n.id === noteId) || {});

    // Bind save handler
    window.saveWritingNote = (id) => {
      const text = document.getElementById("writing-text-editor").value.trim();
      if (!text) return;
      if (id === "new") {
        store.addNote(text);
      } else {
        store.updateNote(id, text);
      }
      window.location.hash = "#/me/writing";
    };

    return `
      <div class="p-6 space-y-6 fade-in text-stone-200">
        <div class="flex items-center justify-between">
          <a href="#/me/writing" class="p-1 rounded hover:bg-stone-800 text-stone-400 hover:text-white">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </a>
          <span class="text-[10px] font-mono text-stone-500">${note.createdAt || 'NEW NOTE'}</span>
        </div>

        <div class="space-y-4">
          <span class="onboarding-badge">Writings Editor</span>
          <textarea id="writing-text-editor" class="w-full bg-stone-900/40 border border-stone-850 rounded-xl p-4 text-base text-stone-100 font-serif leading-relaxed min-h-[300px] outline-none focus:border-stone-700 focus:ring-0" 
                    placeholder="在这里倾诉你的记忆细节...">${note.text || ''}</textarea>
        </div>

        <div class="flex justify-end">
          <button class="px-5 py-2.5 rounded-lg bg-stone-200 text-stone-950 text-xs font-medium font-sans hover:bg-white transition-all shadow-md" onclick="window.saveWritingNote('${noteId}')">
            保存并返回
          </button>
        </div>
      </div>
    `;
  }

  // 4. ME PRIVACY VIEW
  if (pageId === "me-privacy") {
    return `
      <div class="p-6 space-y-6 fade-in text-stone-200">
        <div class="flex items-center gap-3">
          <a href="#/me" class="p-1 rounded hover:bg-stone-800 text-stone-400 hover:text-white">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </a>
          <h1 class="text-xl font-display font-medium text-white">隐私与元数据</h1>
        </div>

        <div class="space-y-4">
          ${renderSettingsToggle(
            "敏感信息模糊 (Blur)",
            "自动对分享或导出的 Capsule 账单小票中可能包含的商户卡号、私人名称进行光学模糊处理。",
            "sensitiveBlur",
            state.settings.sensitiveBlur
          )}

          ${renderSettingsToggle(
            "本地深度 OCR 提取",
            "在本地沙盒环境中分析所有的文本、日期与商户名，永不上传到 Elsewhere 之外的任何第三方。",
            "ocrProcessing",
            state.settings.ocrProcessing
          )}

          ${renderSettingsToggle(
            "EXIF 地理位置加密",
            "导出或分享旅行胶囊时，自动对原始照片的地理坐标（EXIF）进行加密，防止隐私泄露。",
            "highAccuracyGPS",
            state.settings.highAccuracyGPS
          )}
        </div>
      </div>
    `;
  }

  // 5. ME PREFERENCES VIEW
  if (pageId === "me-preferences") {
    return `
      <div class="p-6 space-y-6 fade-in text-stone-200">
        <div class="flex items-center gap-3">
          <a href="#/me" class="p-1 rounded hover:bg-stone-800 text-stone-400 hover:text-white">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </a>
          <h1 class="text-xl font-display font-medium text-white">偏好设置</h1>
        </div>

        <div class="space-y-4">
          <div class="p-4 bg-stone-900/60 border border-stone-850 rounded-xl space-y-2">
            <h4 class="text-sm font-medium text-white">地图基础外观</h4>
            <p class="text-xs text-stone-500">选择 3D 拟真地球和城市 Canvas 视图的图层渲染样式。</p>
            <div class="grid grid-cols-2 gap-2 mt-2">
              <button class="py-2 text-center rounded bg-stone-200 text-stone-950 text-xs font-mono">
                微弱网格 (Grid)
              </button>
              <button class="py-2 text-center rounded bg-stone-900 border border-stone-850 text-stone-400 text-xs font-mono">
                纯黑背景 (Void)
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // 6. ME STORAGE VIEW
  if (pageId === "me-storage") {
    return `
      <div class="p-6 space-y-6 fade-in text-stone-200">
        <div class="flex items-center gap-3">
          <a href="#/me" class="p-1 rounded hover:bg-stone-800 text-stone-400 hover:text-white">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </a>
          <h1 class="text-xl font-display font-medium text-white">存储状况</h1>
        </div>

        <div class="archive-card p-5 space-y-4">
          <div>
            <div class="flex justify-between text-xs text-stone-400 font-mono">
              <span>设备本地存储使用量</span>
              <span>12.4 MB / 100 MB 模拟沙盒</span>
            </div>
            <!-- Progress Bar -->
            <div class="w-full h-1.5 bg-stone-800 rounded-full mt-2 overflow-hidden">
              <div class="w-[12%] h-full bg-amber-500"></div>
            </div>
          </div>

          <div class="text-xs text-stone-500 leading-relaxed font-sans pt-2">
            我们所有的图片和元数据只在本地 IndexedDB 及 sandbox 中缓存，你可以随时清理而不会损坏你手机上的原始相册文件。
          </div>
        </div>
      </div>
    `;
  }

  // 7. ME EXPORT VIEW
  if (pageId === "me-export") {
    return `
      <div class="p-6 space-y-6 fade-in text-stone-200">
        <div class="flex items-center gap-3">
          <a href="#/me" class="p-1 rounded hover:bg-stone-800 text-stone-400 hover:text-white">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </a>
          <h1 class="text-xl font-display font-medium text-white">数据备份与导出</h1>
        </div>

        <p class="text-sm text-stone-400">
          Elsewhere 承认你在自己数字遗物上的绝对主权。支持随时完整无损地导出你拼凑出的所有数据与关系：
        </p>

        <div class="grid grid-cols-1 gap-4">
          <div class="archive-card p-4 space-y-2">
            <h4 class="text-sm font-medium text-white">导出为 Elsewhere JSON 标准数据库</h4>
            <p class="text-xs text-stone-500">包含所有的城市数据、时光证据、OCR文本、用户日记及计算出的连接规则模型。</p>
            <button class="w-full py-2.5 mt-2 rounded bg-stone-200 text-stone-950 text-xs font-mono hover:bg-white transition-all shadow-md">
              导出 database.json
            </button>
          </div>

          <div class="archive-card p-4 space-y-2">
            <h4 class="text-sm font-medium text-white">打包导出静态 HTML 私人档案馆</h4>
            <p class="text-xs text-stone-500">导出一个完全自给自足、不需要联网的静态 HTML 网站压缩包，你可以用任何浏览器永久离线打开浏览。</p>
            <button class="w-full py-2.5 mt-2 rounded bg-stone-900 border border-stone-800 text-stone-300 text-xs font-mono hover:bg-stone-800 transition-all">
              导出 offline-archive.zip
            </button>
          </div>
        </div>
      </div>
    `;
  }

  return `<div class="p-4">Unknown Me route ${pageId}</div>`;
}
