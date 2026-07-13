export function renderBottomNavigation(currentRoute) {
  const isWorld = currentRoute.startsWith("#/world");
  const isDiscover = currentRoute.startsWith("#/discover");
  const isMe = currentRoute.startsWith("#/me");

  // Onboarding should not show navigation
  if (currentRoute.startsWith("#/onboarding")) {
    return "";
  }

  return `
    <nav class="bottom-navigation fade-in">
      <a href="#/world" class="nav-item ${isWorld ? 'active' : ''}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
          <path d="M2 12h20"/>
        </svg>
        <span class="mt-1 font-sans text-[10px] tracking-wider">世界</span>
      </a>
      <a href="#/discover" class="nav-item ${isDiscover ? 'active' : ''}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <path d="m12 3-1.912 5.886L4.2 9.075l4.957 4.1-1.894 5.825L12 15.4l4.737 3.6-1.894-5.825 4.957-4.1-5.888-.189Z"/>
        </svg>
        <span class="mt-1 font-sans text-[10px] tracking-wider">发现</span>
      </a>
      <a href="#/me" class="nav-item ${isMe ? 'active' : ''}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
        <span class="mt-1 font-sans text-[10px] tracking-wider">我的</span>
      </a>
    </nav>
  `;
}
