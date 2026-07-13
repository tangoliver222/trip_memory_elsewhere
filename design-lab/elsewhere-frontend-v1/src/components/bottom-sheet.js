import { store } from "../store.js";

export function renderBottomSheet(state, contentHtml, overlayName, isOpen) {
  if (!isOpen) {
    return "";
  }

  // Bind click functions globally if not already bound
  if (!window.closeBottomSheet) {
    window.closeBottomSheet = (name) => {
      store.setOverlay(name, false);
    };
  }

  return `
    <div class="bottom-sheet-backdrop active" onclick="window.closeBottomSheet('${overlayName}')"></div>
    <div class="bottom-sheet-container active" onclick="event.stopPropagation()">
      <div class="bottom-sheet-drag-handle" onclick="window.closeBottomSheet('${overlayName}')"></div>
      <div class="bottom-sheet-content">
        ${contentHtml}
      </div>
    </div>
  `;
}
