let currentPuuid = null;

async function fetchJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error('API error');
  return res.json();
}

async function loadMatches() {
  const params = new URLSearchParams(window.location.search);
  currentPuuid = params.get('puuid');

  if (!currentPuuid) {
    currentPuuid = sessionStorage.getItem('currentPuuid');
    if (!currentPuuid) {
      window.location.href = '/';
      return;
    }
  }

  sessionStorage.setItem('currentPuuid', currentPuuid);

  try {
    const matches = await fetchJSON(`/api/matches?puuid=${currentPuuid}&limit=100`);
    const container = document.getElementById('matches-container');
    container.innerHTML = '';

    if (Array.isArray(matches) && matches.length) {
      matches.forEach(m => {
        const resultClass = m.win ? 'win' : 'loss';
        const el = document.createElement('div');
        el.className = `match-row ${resultClass}`;
        el.innerHTML = `
          <div class="match-left">
            <div class="match-position">${m.position}</div>
            <div class="match-champ">${m.champion_name}</div>
          </div>
          <div class="match-center">
            <div class="match-kda"><span>${m.kills}/${m.deaths}/${m.assists}</span></div>
            <div class="match-gold">${m.goldEarned || 0} gold • ${m.totalMinionsKilled || 0} CS</div>
          </div>
          <div class="match-right">
            <div class="match-opponent">vs ${m.opponent_champion}</div>
            <div class="match-result">${m.win ? 'W' : 'L'}</div>
          </div>
        `;
        container.appendChild(el);
      });
    }
  } catch (err) {
    console.error('Load error', err);
  }
}

loadMatches();