let currentPuuid = null;

async function fetchJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error('API error');
  return res.json();
}

async function loadChampions() {
  const params = new URLSearchParams(window.location.search);
  currentPuuid = params.get('puuid');

  if (!currentPuuid) {
    // Try to get from sessionStorage or redirect
    currentPuuid = sessionStorage.getItem('currentPuuid');
    if (!currentPuuid) {
      window.location.href = '/';
      return;
    }
  }

  sessionStorage.setItem('currentPuuid', currentPuuid);

  try {
    const champions = await fetchJSON(`/api/champions?puuid=${currentPuuid}`);
    const container = document.getElementById('champions-container');
    container.innerHTML = '';

    if (Array.isArray(champions) && champions.length) {
      champions.forEach(c => {
        const card = document.createElement('div');
        card.className = 'champ-card';
        card.innerHTML = `
          <div class="name">${c.champion_name}</div>
          <div class="stat">Matches: ${c.matches}</div>
          <div class="stat">Winrate: ${c.winrate}%</div>
          <div class="stat">KDA: ${c.avg_kda}</div>
          <div class="stat">Avg Stats: ${c.avg_kills}/${c.avg_deaths}/${c.avg_assists}</div>
        `;
        container.appendChild(card);
      });
    }
  } catch (err) {
    console.error('Load error', err);
  }
}

loadChampions();