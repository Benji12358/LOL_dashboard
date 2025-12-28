let currentPuuid = null;
let matchesOffset = 0;
let matchesLimit = 8;
let totalMatches = 0;
let roleChart = null;
let matchesGameModeFilter = 'all';
let matchesRoleFilter = 'all';
let eloGameModeFilter = 'all';
let availableRoles = [];
let itemNames = {};
let sumspellNames = {};
let currentRightView = 'recent';
let currentRankFilter = 'all';

// Définis ces constantes ici, elles sont globales
const ranks = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER'];
const roles = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'SUPPORT'];

const roleIconMap = {
  'TOP': 'static/assets/roles/Top_icon.png',
  'JUNGLE': 'static/assets/roles/Jungle_icon.png',
  'MIDDLE': 'static/assets/roles/Middle_icon.png',
  'BOTTOM': 'static/assets/roles/Adc_icon.png',
  'SUPPORT': 'static/assets/roles/Support_icon.png'
};

async function fetchJSON(path) {
  const res = await fetch(path);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'API error');
  }
  return res.json();
}

// Load item and sumspell names
async function loadAssetNames() {
  try {
    const items = await fetchJSON('static/assets/item.json');
    itemNames = items || {};
    
    const sumspells = await fetchJSON('static/assets/sumspell.json');
    sumspellNames = sumspells || {};
  } catch (err) {
    console.error('Error loading asset names:', err);
  }
}

function getItemName(itemId) {
  return itemNames[itemId] || `Item ${itemId}`;
}

function getSumspellName(spellId) {
  return sumspellNames[spellId] || `Spell ${spellId}`;
}

function formatTimestamp(timestamp) {
  let date;
  if (typeof timestamp === 'string') {
    const ts = parseInt(timestamp);
    date = new Date(ts);
  } else {
    const ts = timestamp > 9999999999 ? timestamp : timestamp * 1000;
    date = new Date(ts);
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getRelativeTime(timestamp) {
  let ts;
  if (typeof timestamp === 'string') {
    ts = parseInt(timestamp);
  } else {
    ts = timestamp > 9999999999 ? timestamp : timestamp * 1000;
  }

  const now = Date.now();
  const diffMs = now - ts;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return '1d ago';
  if (diffDays < 30) return `${diffDays}d ago`;
  return formatTimestamp(ts);
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function formatKDA(kda) {
  return (Math.round(kda * 10) / 10).toFixed(1);
}

function getKdaColor(kda) {
  if (kda >= 5) return '#d7b04a';
  if (kda >= 3) return '#b19cd9';
  if (kda >= 1.5) return '#87ceeb';
  return '#9fa3a6';
}

function getCSMinColor(csMin) {
  if (csMin >= 7) return '#0adf7a';
  if (csMin < 5) return '#ff5c66';
  return '#e6dac2';
}

function getGoldMinColor(goldMin) {
  if (goldMin >= 500) return '#0adf7a';
  if (goldMin < 300) return '#ff5c66';
  return '#e6dac2';
}

function roleToIcon(role) {
  const roleMap = {
    'TOP': 'Top_icon',
    'JUNGLE': 'Jungle_icon',
    'MIDDLE': 'Middle_icon',
    'BOTTOM': 'Adc_icon',
    'UTILITY': 'Support_icon'
  };
  return roleMap[role] || null;
}

function renderChampList(champions_list, text) {
  champListHtml = `
  <h3 style="text-align: left; margin-top: 50px">${text}</h3>
  <div class="champs-list">
  `;
  champions_list.forEach(([champ, role]) => {
    const roleIcon = roleToIcon(role);
    innerHTML = `
      <div class="champ-icon-wrapper">
        <img src="static/assets/champion/${champ.replace(/\s+/g, '')}.png" alt="${champ}" class="match-champ-icon" title="${champ}">
        <img src="static/assets/roles/${roleIcon}.png" alt="${role}" class="match-role-icon" title="${role}">
      </div>
    `;
    champListHtml += `${innerHTML}`;
  });
  champListHtml += `</div>`;
  return champListHtml;
}

function renderItemSlots(items, summoner1Id, summoner2Id, zoomlvl) {
  const itemHtml = `
    <div class="items-section" style="zoom:${zoomlvl};">
      <div class="summoner-spells">
        ${summoner1Id ? `<img src="static/assets/sumspell/${summoner1Id}.png" alt="Summoner 1" class="sumspell-icon" title="${getSumspellName(summoner1Id)}">` : ''}
        ${summoner2Id ? `<img src="static/assets/sumspell/${summoner2Id}.png" alt="Summoner 2" class="sumspell-icon" title="${getSumspellName(summoner2Id)}">` : ''}
      </div>
      <div class="items-grid">
        ${items.slice(0, 3).map(itemId => itemId ? `<img src="static/assets/item/${itemId}.png" alt="Item" class="item-icon" title="${getItemName(itemId)}">` : '<div class="item-slot-empty"></div>').join('')}
        ${items.slice(3, 6).map(itemId => itemId ? `<img src="static/assets/item/${itemId}.png" alt="Item" class="item-icon" title="${getItemName(itemId)}">` : '<div class="item-slot-empty"></div>').join('')}
      </div>
    </div>
  `;
  return itemHtml;
}

async function loadDefault() {
  try {
    await loadAssetNames();
    const summoner = await fetchJSON('/api/summoner-default');
    currentPuuid = summoner.puuid;
    await loadAvailableRoles();
    await refresh();
    await switchRightView(currentRightView); // Initialise la vue
  } catch (err) {
    console.error('Error loading default summoner:', err);
  }
}

async function loadAvailableRoles() {
  try {
    const data = await fetchJSON(`/api/available-roles?puuid=${currentPuuid}`);
    availableRoles = data.roles || [];
    updateRoleButtons();
  } catch (err) {
    console.error('Error loading available roles:', err);
  }
}

function updateRoleButtons() {
  const roleButtons = Array.from(document.querySelectorAll('.role-btn'))
    .filter(b => b.dataset.value && b.dataset.value.toLowerCase() !== 'all');
  roleButtons.forEach(btn => {
    const role = btn.dataset.value;
    if (availableRoles.includes(role)) {
      btn.classList.remove('disabled');
      btn.disabled = false;
    } else {
      btn.classList.add('disabled');
      btn.disabled = true;
    }
  });
}

async function refresh() {
  if (!currentPuuid) return;

  try {
    const [summary, champions, roleStats, pingStats, opponentData] = await Promise.all([
      fetchJSON(`/api/summary?puuid=${currentPuuid}`),
      fetchJSON(`/api/champions?puuid=${currentPuuid}`),
      fetchJSON(`/api/role-stats?puuid=${currentPuuid}`),
      fetchJSON(`/api/ping-stats?puuid=${currentPuuid}`),
      fetchJSON(`/api/opponent-elo-distribution?puuid=${currentPuuid}`)
    ]);

    // Header
    const s = summary.summoner || {};
    document.getElementById('summoner-name').textContent = s.summoner_name || 'Unknown';
    document.getElementById('summoner-tag').textContent = s.summoner_tag ? `#${s.summoner_tag}` : '';

    document.getElementById('winrate').textContent = summary.winrate ? `${summary.winrate}%` : '—';
    document.getElementById('kda').textContent = summary.kda ? `${formatKDA(summary.kda)}` : '—';
    document.getElementById('wl').textContent = `${summary.wins || 0} / ${summary.losses || 0}`;
    document.getElementById('games-count').textContent = summary.total_games || 0;

    // Role Stats Chart
    drawRoleStatsChart(roleStats);

    // Ping Stats
    drawPingStats(pingStats);

    // Top Champions
    drawTopChampions(champions.slice(0, 3));

    // Opponent Elo Distribution
    window._lastOpponentData = opponentData.opponents || [];
    drawOpponentEloDistribution(window._lastOpponentData);

    // External links (Mobalytics, dpm.lol, League of Graphs)
    try {
      const sname = encodeURIComponent((s.summoner_name || '').replace(/ /g, ''));
      const stag = encodeURIComponent(s.summoner_tag || '');
      document.getElementById('mobalytics-link').href = `https://mobalytics.gg/lol/profile/euw/${sname}-${stag}/overview`;
      document.getElementById('dpm-link').href = `https://dpm.lol/${sname}-${stag}`;
      document.getElementById('lographs-link').href = `https://www.leagueofgraphs.com/summoner/euw/${sname}-${stag}`;
    } catch (err) {
      console.warn('Error setting external links', err);
    }

    // Load first batch of matches
    matchesOffset = 0;
    totalMatches = 0;
    await loadMoreMatches(true);

  } catch (err) {
    console.error('Refresh error:', err);
  }
}

function drawRoleStatsChart(roleStats) {
  const validRoles = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'SUPPORT'];
  
  const normalizedRoles = roleStats.map(r => {
    let role = r.role.toUpperCase();
    if (role === 'MID') role = 'MIDDLE';
    if (role === 'ADC' || role === 'BOTTOM') role = 'BOTTOM';
    if (role === 'UTILITY') role = 'SUPPORT';
    return { ...r, role };
  }).filter(r => validRoles.includes(r.role));

  const roleMap = {};
  validRoles.forEach(role => {
    roleMap[role] = { matches: 0, winrate: 0 };
  });
  normalizedRoles.forEach(r => {
    if (roleMap[r.role]) {
      roleMap[r.role].matches = r.matches;
      roleMap[r.role].winrate = r.winrate;
    }
  });

  const data = validRoles.map(role => roleMap[role].matches);
  const winrates = validRoles.map(role => roleMap[role].winrate);

  // Preload icons
  if (!window._roleIconCache) window._roleIconCache = {};
  validRoles.forEach(role => {
    const path = roleIconMap[role];
    if (path && !window._roleIconCache[path]) {
      const img = new Image();
      img.src = path;
      window._roleIconCache[path] = img;
    }
  });

  const ctx = document.getElementById('role-stats-chart').getContext('2d');
  
  if (roleChart) {
    roleChart.destroy();
  }

  roleChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: validRoles,
      datasets: [{
        label: 'Games',
        data: data,
        backgroundColor: '#d7b04a',
        borderColor: '#b8951f',
        borderWidth: 1,
        barThickness: 8,
        maxBarThickness: 12,
        barPercentage: 0.7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          bottom: 55,  // espace pour icons et text
          top: 10
        }
      },
      scales: {
        y: {
          display: false,
          beginAtZero: true
        },
        x: {
          ticks: { display: false },
          grid: { display: false }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false }
      }
    },
    plugins: [{
      id: 'drawRoleLabels',
      afterDraw(chart) {
        const ctx = chart.ctx;
        const chartArea = chart.chartArea;
        const meta = chart.getDatasetMeta(0);
        
        meta.data.forEach((bar, idx) => {
          const role = validRoles[idx];
          const matches = data[idx];
          const winrate = (Math.round(winrates[idx] * 100) / 100).toFixed(0);
          const imgPath = roleIconMap[role];
          const img = window._roleIconCache[imgPath];
          
          // Position sous le chart area
          const barX = bar.x;
          const baseY = chartArea.bottom + 12;
          
          // Draw icon
          const iconSize = 26;
          if (img && img.complete) {
            ctx.drawImage(img, barX - iconSize / 2, baseY, iconSize, iconSize);
          }
          
          // Draw text below icon
          ctx.fillStyle = '#e6dac2';
          ctx.font = 'bold 13px Inter, Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          const textY = baseY + iconSize + 4;
          ctx.fillText(`${matches} (${winrate}%)`, barX, textY);
        });
      }
    }]
  });
}

function drawPingStats(pingStats) {
  const pingLabels = {
    'allInPings': 'all-in',
    'assistMePings': 'assist-me',
    'basicPings': 'basic',
    'commandPings': 'command',
    'dangerPings': 'danger',
    'enemyMissingPings': 'enemy-missing',
    'enemyVisionPings': 'enemy-vision',
    'getBackPings': 'get-back',
    'holdPings': 'hold',
    'needVisionPings': 'need-vision',
    'onMyWayPings': 'on-my-way',
    'pushPings': 'push',
    'retreatPings': 'retreat',
    'visionClearedPings': 'vision-cleared'
  };

  const container = document.getElementById('ping-stats');
  container.innerHTML = '';

  Object.entries(pingLabels).forEach(([key, label]) => {
    const val = pingStats[key] || 0;
    if (val > 0) {
      const div = document.createElement('div');
      div.className = 'ping-item';
      div.innerHTML = `
        <img src="static/assets/pings/${label}.png" alt="${label}" class="ping-icon" title="${label}">
        <span class="ping-value">${val}</span>
      `;
      container.appendChild(div);
    }
  });
}

function drawTopChampions(champions) {
  const container = document.getElementById('champions-list');
  container.innerHTML = '';

  champions.forEach(c => {
    const div = document.createElement('div');
    div.className = 'champ-card';
    const champIcon = c.champion_name.replace(/\s+/g, '');
    const avgKDA = formatKDA(c.avg_kda);
    const kdaColor = getKdaColor(c.avg_kda);
    const csPerMin = (c.avg_cs / (c.avg_duration / 60)).toFixed(1);
    const csColor = getCSMinColor(csPerMin);
    
    div.innerHTML = `
      <img src="static/assets/champion/${champIcon}.png" alt="${c.champion_name}" class="champ-icon">
      <div class="champ-info">
        <div class="champ-name">${c.champion_name}</div>
        <div class="champ-meta">${c.matches} games • ${c.winrate}%</div>
        <div class="champ-stats">
          <span class="champ-kills">${formatKDA(c.avg_kills)}</span> / 
          <span class="champ-deaths">${formatKDA(c.avg_deaths)}</span> / 
          <span class="champ-assists">${formatKDA(c.avg_assists)}</span> |
          <span class="champ-kda" style="color: ${kdaColor}">${avgKDA} KDA</span> |
          <span class="champ-cs" style="color: ${csColor}">${csPerMin} (CS)</span>
        </div>
      </div>
    `;
    container.appendChild(div);
  });
}

function drawOpponentEloDistribution(opponents) {
  const ranks = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND'];
  const divisions = ['IV', 'III', 'II', 'I'];

  // ─────────────────────────────────────────────────────────────
  // 1. Construction des labels AVEC espaces entre les rangs
  // ─────────────────────────────────────────────────────────────
  const labels = [];
  const GAP_SIZE = 1; // 1 = environ une demi-barre d'espace (ajuste selon tes goûts : 1 ou 2)

  ranks.forEach((rank, rankIndex) => {
    divisions.forEach(div => {
      labels.push(`${rank} ${div}`);
    });
    // Ajouter des placeholders vides entre les rangs (sauf après le dernier)
    if (rankIndex < ranks.length - 1) {
      for (let i = 0; i < GAP_SIZE; i++) {
        labels.push(''); // label vide = espace
      }
    }
  });
  // On ajoute MASTER à la fin, avec un espace avant si on veut
  labels.push(''); // espace optionnel avant MASTER
  labels.push('MASTER');

  // ─────────────────────────────────────────────────────────────
  // 2. Comptage des occurrences (seulement sur les labels réels)
  // ─────────────────────────────────────────────────────────────
  const countMap = {};
  labels.forEach(label => countMap[label] = 0); // initialise tout à 0

  // Mapping des valeurs des boutons vers les valeurs réelles dans la base de données
  const gameModeMapping = {
    'all': null, // pas de filtre
    'normal': 'Normal Draft',
    'solo': 'Ranked Solo',
    'flex': 'Ranked Flex',
    'swiftplay': 'Swift Play'
  };

  const targetMode = gameModeMapping[eloGameModeFilter];

  const filteredOpponents = (targetMode)
    ? opponents.filter(o => (o.gameMode || '') === targetMode)
    : opponents;

  filteredOpponents.forEach(opp => {
    const rankStr = opp.rank || opp.current_rank || '';
    const parts = rankStr.trim().split('_');
    if (parts.length === 2) {
      let rank = parts[0].toUpperCase();
      let division = parts[1].toUpperCase();

      if (rank === 'MASTER') {
        countMap['MASTER']++;
      } else if (ranks.includes(rank) && divisions.includes(division)) {
        const key = `${rank} ${division}`;
        countMap[key]++;
      }
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 3. Préparation des données (null pour les gaps)
  // ─────────────────────────────────────────────────────────────
  const data = labels.map(label => {
    if (label === '') return null; // ou 0 si tu préfères une barre invisible
    return countMap[label];
  });

  // ─────────────────────────────────────────────────────────────
  // 4. Filtrage optionnel des barres à zéro (mais on garde les gaps)
  // ─────────────────────────────────────────────────────────────
  // On NE filtre plus les labels/data, car on veut conserver les espaces
  // (sinon les gaps disparaissent)

  const datasets = [{
    label: 'Nombre d\'adversaires',
    data: data,
    backgroundColor: '#d7b04a',
    borderColor: '#b8951f',
    borderWidth: 1,
    barThickness: 8,
    maxBarThickness: 12,
    // Optionnel : barres un peu plus espacées naturellement
    categoryPercentage: 0.9,
    barPercentage: 0.85
  }];

  const ctx = document.getElementById('opponent-elo-chart');
  if (!ctx) {
    console.error('opponent-elo-chart canvas not found');
    return;
  }

  const canvasCtx = ctx.getContext('2d');

  if (window.opponentEloChart) {
    window.opponentEloChart.destroy();
  }

  window.opponentEloChart = new Chart(canvasCtx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          bottom: 30,  // espace pour les icônes
          top: 5,
          left: 5,
          right: 20
        }
      },
      scales: {
        y: {
          display: false,
          beginAtZero: true
        },
        x: {
          ticks: {
            display: false  // on garde les labels cachés
          },
          grid: {
            display: false
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.8)',
          bodyFont: { size: 12 },
          callbacks: {
            label: function(context) {
              return `${context.parsed.y} opponents(s)`;
            },
            title: function(context) {
              const label = context[0].label;
              return label ? label : ''; // évite d'afficher "" dans le tooltip
            }
          }
        }
      }
    },
    plugins: [{
      id: 'drawRankIcons',
      afterDraw(chart) {
        const ctx = chart.ctx;
        const chartArea = chart.chartArea;
        const meta = chart.getDatasetMeta(0);
        if (!meta || !meta.data.length) return;

        if (!window._rankIconCache) window._rankIconCache = {};

        // ─────────────────────────────────────────────────────────────
        // Icônes pour les rangs normaux (centrées sur leurs 4 divisions)
        // ─────────────────────────────────────────────────────────────
        ranks.forEach(rank => {
          const divisionIndices = divisions.map(div => {
            const fullLabel = `${rank} ${div}`;
            return labels.indexOf(fullLabel);
          }).filter(idx => idx !== -1);

          if (divisionIndices.length === 0) return;

          const xPositions = divisionIndices.map(i => meta.data[i]?.x).filter(x => x !== undefined);
          if (xPositions.length === 0) return;

          const centerX = xPositions.reduce((a, b) => a + b, 0) / xPositions.length;

          const imgPath = `static/assets/rank/rank_${rank.toLowerCase()}.png`;
          if (!window._rankIconCache[imgPath]) {
            const img = new Image();
            img.src = imgPath;
            window._rankIconCache[imgPath] = img;
          }
          const img = window._rankIconCache[imgPath];

          const baseY = chartArea.bottom + 10;
          const iconSize = 28;

          if (img && img.complete) {
            ctx.drawImage(img, centerX - iconSize / 2, baseY, iconSize, iconSize);
          }
        });

        // ─────────────────────────────────────────────────────────────
        // Icône MASTER
        // ─────────────────────────────────────────────────────────────
        const masterIndex = labels.indexOf('MASTER');
        const bar = meta.data[masterIndex];
        if (!bar) return;

        let masterX = bar.x;
        const masterOffset = 12; // décale un peu à droite pour éviter chevauchement

        masterX += masterOffset;

        const imgPath = 'static/assets/rank/rank_master.png';
        if (!window._rankIconCache[imgPath]) {
          const img = new Image();
          img.src = imgPath;
          window._rankIconCache[imgPath] = img;
        }
        const img = window._rankIconCache[imgPath];

        const baseY = chartArea.bottom + 10;
        const iconSize = 28;

        if (img && img.complete) {
          ctx.drawImage(img, masterX - iconSize / 2, baseY, iconSize, iconSize);
        }
      }
    }]
  });
}

async function loadMoreMatches(reset = false) {
  if (reset) {
    matchesOffset = 0;
    document.getElementById('matches-list').innerHTML = '';
  }

  try {
    const response = await fetchJSON(
      `/api/matches?puuid=${currentPuuid}&limit=${matchesLimit}&offset=${matchesOffset}&gameMode=${matchesGameModeFilter}&role=${matchesRoleFilter}`
    );
    const matches = response.matches;
    totalMatches = response.total;

    const container = document.getElementById('matches-list');

    // Group matches by date
    const matchesByDate = {};
    matches.forEach(m => {
      const date = formatTimestamp(m.gameEndTimestamp);
      if (!matchesByDate[date]) {
        matchesByDate[date] = [];
      }
      matchesByDate[date].push(m);
    });

    // Render grouped matches
    Object.entries(matchesByDate).forEach(([date, dayMatches]) => {
      const dateDiv = document.createElement('div');
      dateDiv.className = 'match-date-group';
      dateDiv.innerHTML = `<div class="match-date">${date}</div>`;

      dayMatches.forEach(m => {
        const resultClass = m.win ? 'win' : 'loss';
        const kdaColor = getKdaColor(m.kda);
        const opponentKdaColor = getKdaColor(m.opponent_kda);
        const champIcon = m.champion_name.replace(/\s+/g, '');
        const opponentIcon = m.opponent_champion.replace(/\s+/g, '');
        const roleIcon = roleToIcon(m.position);
        const relativeTime = getRelativeTime(m.gameEndTimestamp);
        const duration = formatDuration(m.gameDuration);
        const formattedKDA = formatKDA(m.kda);

        // Calcul CS par minute
        const gameDurationMins = m.gameDuration / 60;
        const csPerMin = (m.totalMinionsKilled / gameDurationMins).toFixed(1);
        const opponentCsPerMin = (m.opponent_cs / gameDurationMins).toFixed(1);
        const csMinColor = getCSMinColor(csPerMin);
        const opponentCsMinColor = getCSMinColor(opponentCsPerMin);

        // Items du joueur
        const playerItems = [m.item0, m.item1, m.item2, m.item3, m.item4, m.item5].filter(i => i);
        const playerItemsHtml = renderItemSlots(playerItems, m.summoner1Id, m.summoner2Id, 1);

        // Items de l'adversaire
        const opponentItems = [m.opponent_item0, m.opponent_item1, m.opponent_item2, m.opponent_item3, m.opponent_item4, m.opponent_item5].filter(i => i);
        const opponentItemsHtml = renderItemSlots(opponentItems, m.opponent_summoner1Id, m.opponent_summoner2Id, 0.8);

        const matchEl = document.createElement('div');
        matchEl.className = `match-row ${resultClass}`;
        matchEl.innerHTML = `
          <div class="match-gameinfo">
            <div class="match-gamemode">${m.gameMode}</div>
            <div class="match-duration">${duration}</div>
            <div class="match-time">${relativeTime}</div>
          </div>

          <div class="match-champ">
            <div class="champ-wrapper">
              <img src="static/assets/champion/${champIcon}.png" alt="${m.champion_name}" class="match-champ-icon">
              ${roleIcon ? `<img src="static/assets/roles/${roleIcon}.png" alt="${m.position}" class="match-role-icon">` : ''}
            </div>
          </div>

          <div class="match-stats">
            <div class="match-kda-line">
              <span class="match-kills">${m.kills}</span> / 
              <span class="match-deaths">${m.deaths}</span> / 
              <span class="match-assists">${m.assists}</span> |
              <span class="match-kda" style="color: ${kdaColor}">${formattedKDA} KDA</span>
            </div>
            <div class="match-gold">${m.totalMinionsKilled} (<span style="color: ${csMinColor}">${csPerMin}</span>) CS • ${m.goldEarned} gold</div>
          </div>

          ${playerItemsHtml}

          <div class="match-vs">
            <div class="opponent-header">${m.champion_name} vs ${m.opponent_champion}</div>
            <div class="opponent-wrapper">
              <div class="opponent-champ-wrapper">
                <img src="static/assets/champion/${opponentIcon}.png" alt="${m.opponent_champion}" class="match-opponent-icon" title="${m.opponent_champion}">
              </div>
              <div class="opponent-stats">
                <div>
                  <span class="opponent-kills">${m.opponent_kills}</span> / 
                  <span class="opponent-deaths">${m.opponent_deaths}</span> / 
                  <span class="opponent-assists">${m.opponent_assists}</span>
                  <span class="opponent-kda" style="color: ${opponentKdaColor}">| ${formatKDA(m.opponent_kda)} KDA</span>
                </div>
                <div class="opponent-gold">${m.opponent_cs} (<span style="color: ${opponentCsMinColor}">${opponentCsPerMin}</span>) CS • ${m.opponent_gold} gold</div>
              </div>
              ${opponentItemsHtml}
            </div>
          </div>
        `;
        dateDiv.appendChild(matchEl);
      });

      container.appendChild(dateDiv);
    });

    matchesOffset += matchesLimit;

    // Update load more button
    const loadMoreBtn = document.getElementById('load-more-btn');
    if (matchesOffset >= totalMatches) {
      loadMoreBtn.style.display = 'none';
    } else {
      loadMoreBtn.style.display = 'block';
    }

  } catch (err) {
    console.error('Error loading matches:', err);
  }
}

// Nouvelle fonction pour switcher la vue dans right-col
async function switchRightView(view) {
  currentRightView = view;

  const recentSection = document.getElementById('recent-matches-section');
  const performanceSection = document.getElementById('elo-performance-section');
  const last30Section = document.getElementById('last-30-section');

  const recentBtn = document.getElementById('recent-matches-btn');
  const performanceBtn = document.getElementById('elo-performance-btn');
  const last30Btn = document.getElementById('last-30-btn');

  // Masquer toutes les sections
  recentSection.style.display = 'none';
  performanceSection.style.display = 'none';
  last30Section.style.display = 'none';

  // Déactiver tous les boutons
  recentBtn.classList.remove('active');
  performanceBtn.classList.remove('active');
  last30Btn.classList.remove('active');

  if (view === 'recent') {
    recentSection.style.display = 'block';
    recentBtn.classList.add('active');
    if (totalMatches === 0) {
      matchesOffset = 0;
      await loadMoreMatches(true);
    }
  } else if (view === 'performance') {
    performanceSection.style.display = 'block';
    performanceBtn.classList.add('active');
    if (!window._performanceData) {
      const url = `/api/performance?puuid=${currentPuuid}`;
      window._performanceData = await fetchJSON(url);
    }
    renderPerformance(window._performanceData);
  } else if (view === 'last30') {
    last30Section.style.display = 'block';
    last30Btn.classList.add('active');
    if (!window._last30Data) {
      const url = `/api/last-30-summary?puuid=${currentPuuid}`;
      window._last30Data = await fetchJSON(url);
    }
    renderLast30(window._last30Data);
  }
}

// Nouvelle fonction pour render le résumé des 30 dernières parties
function renderLast30(data) {
  const container = document.getElementById('last-30-content');
  container.innerHTML = '';

  const summaryDiv = document.createElement('div');
  const avg_kda =  (data.avg_kills + data.avg_assists) / data.avg_deaths;
  const opp_avg_kda = (data.opp_avg_kills + data.opp_avg_assists) / data.opp_avg_deaths;
  const kdaColor = getKdaColor(avg_kda);
  const formattedKDA = formatKDA(avg_kda);
  const oppkdaColor = getKdaColor(opp_avg_kda);
  const oppformattedKDA = formatKDA(opp_avg_kda);
  const csMinColor = getCSMinColor(data.avg_cs_min);
  const oppCsMinColor = getCSMinColor(data.opp_avg_cs_min);
  const totalGold = Math.round(data.avg_gold / 1000);
  const totalOppGold = Math.round(data.opp_avg_gold / 1000);
  const goldPerMin = (data.avg_gold / (data.avg_game_duration / 60)).toFixed(1);
  const oppGoldPerMin = (data.opp_avg_gold / (data.avg_game_duration / 60)).toFixed(1);
  const goldMinColor = getGoldMinColor(goldPerMin);
  const oppGoldMinColor = getGoldMinColor(oppGoldPerMin);
  
  const champListHtml = renderChampList(data.champions_played, text='Champions Played');
  const oppChampListHtml = renderChampList(data.opponents_faced, text='Opponents Faced');
  summaryDiv.className = 'summary-block';
  summaryDiv.innerHTML = `
    <div class="summoner-section">
      <h3>Average Stats</h3>
      <div class="match-kda-line">
        <span class="match-kills">${data.avg_kills}</span> / 
        <span class="match-deaths">${data.avg_deaths}</span> / 
        <span class="match-assists">${data.avg_assists}</span> |
        <span class="match-kda" style="color: ${kdaColor}">${formattedKDA} KDA</span>
      </div>
      <div class="match-gold">${data.avg_cs} (<span style="color: ${csMinColor}">${data.avg_cs_min}</span>) CS • ${totalGold}K (<span style="color: ${goldMinColor}">${goldPerMin}</span>) gold</div>
    
      ${champListHtml}
    
    </div>
    <div class="opponent-section">
      <h3>Opponents Average Stats</h3>
      <div class="match-kda-line">
        <span class="match-kills">${data.opp_avg_kills}</span> / 
        <span class="match-deaths">${data.opp_avg_deaths}</span> / 
        <span class="match-assists">${data.opp_avg_assists}</span> |
        <span class="match-kda" style="color: ${oppkdaColor}">${oppformattedKDA} KDA</span>
      </div>
      <div class="match-gold">${data.opp_avg_cs} (<span style="color: ${oppCsMinColor}">${data.opp_avg_cs_min}</span>) CS • ${totalOppGold}K (<span style="color: ${oppGoldMinColor}">${oppGoldPerMin}</span>) gold</div>
    
      ${oppChampListHtml}
    
      </div>

  `;
  container.appendChild(summaryDiv);
}

// Nouvelle fonction pour render le contenu performance
function renderPerformance(data) {
  const container = document.getElementById('performance-container');
  container.innerHTML = '';

  const filteredRanks = currentRankFilter === 'all' ? ranks : [currentRankFilter];

  filteredRanks.forEach(rank => {
    const rankData = data.by_rank[rank];
    if (!rankData) return;

    const rankCard = document.createElement('div');
    rankCard.className = 'card rank-card full-width';

    const rankLower = rank.toLowerCase();
    rankCard.innerHTML = `
        <div class="rank-header">
          <img src="static/assets/rank/rank_${rankLower}.png" alt="${rank}" class="rank-icon-small">
          <h3>vs. ${rank}</h3>
        </div>
      `;

    const rolesContainer = document.createElement('div');
    rolesContainer.className = 'roles-container';

    roles.forEach(role => {
      const roleStats = rankData.by_role[role];
      if (roleStats) {
        const imgPath = roleIconMap[role];
        const roleDiv = document.createElement('div');
        const csPerMin = (roleStats.avg_cs / (roleStats.avg_duration / 60)).toFixed(1);
        const csMinColor = getCSMinColor(csPerMin);
        const goldPerMin = (roleStats.avg_gold / (roleStats.avg_duration / 60)).toFixed(1);
        const goldPerMinColor = getGoldMinColor(goldPerMin);
        const goldEarned = Math.round(roleStats.avg_gold / 1000);

        roleDiv.className = 'card role-block';
        roleDiv.innerHTML = `
          <div class="role-icon">
            <img src="${imgPath}" alt="${role}" class="lane-icon-small">
          </div>
          <div class="role-stats">
            Games: ${roleStats.matches} • Winrate: ${roleStats.winrate}% <br>
            <div class="match-kda-line">
              <span class="match-kills">${roleStats.avg_kills}</span> / 
              <span class="match-deaths">${roleStats.avg_deaths}</span> / 
              <span class="match-assists">${roleStats.avg_assists}</span> | 
              <span class="match-kda" style="color: ${getKdaColor(roleStats.kda)}">${formatKDA(roleStats.kda)} KDA</span>
            </div>
            <div class="match-gold">${roleStats.avg_cs} (<span style="color: ${csMinColor}">${csPerMin}</span>) CS • ${goldEarned}K (<span style="color: ${goldPerMinColor}">${goldPerMin}</span>) gold</div>
          </div>
        `;
        rolesContainer.appendChild(roleDiv);
      }
    });

    rankCard.appendChild(rolesContainer);
    container.appendChild(rankCard);
  });

  if (container.children.length === 0) {
    container.innerHTML = '<div class="card">No data available for the selected rank.</div>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Matches game mode filters
  document.querySelectorAll('#matches-game-mode-filters .filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('#matches-game-mode-filters .filter-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      matchesGameModeFilter = this.dataset.value;
      loadMoreMatches(true);
    });
  });

  // Matches role filters
  document.querySelectorAll('#matches-role-filters .filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('#matches-role-filters .filter-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      matchesRoleFilter = this.dataset.value;
      loadMoreMatches(true);
    });
  });

  // Elo game mode filters
  document.querySelectorAll('#elo-game-mode-filters .filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('#elo-game-mode-filters .filter-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      eloGameModeFilter = this.dataset.value;
      if (window._lastOpponentData) {
        drawOpponentEloDistribution(window._lastOpponentData);
      }
    });
  });

  // Database action buttons
  document.getElementById('db-update-btn').addEventListener('click', async () => {
    if (confirm('This will update the database. Continue?')) {
      try {
        const res = await fetch('/api/database/update', { method: 'POST' });
        const data = await res.json();
        alert(data.message || 'Database updated');
        location.reload();
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }
  });

  document.getElementById('db-delete-btn').addEventListener('click', async () => {
    if (confirm('This will DELETE ALL data from the database. Are you sure?')) {
      try {
        const res = await fetch('/api/database/delete', { method: 'POST' });
        const data = await res.json();
        alert(data.message || 'Database cleared');
        location.reload();
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }
  });// API key buttons
  document.getElementById('test-api-btn').addEventListener('click', async () => {
    try {
      const res = await fetch('/api/test-api-key');
      const data = await res.json();
      if (res.ok) {
        alert(data.message);
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });

  document.getElementById('update-api-btn').addEventListener('click', async () => {
    const newKey = prompt('Enter new API key:');
    if (newKey) {
      try {
        const res = await fetch('/api/update-api-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: newKey })
        });
        const data = await res.json();
        if (res.ok) {
          alert(data.message);
        } else {
          alert(data.error);
        }
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }
  });

  // Load more matches button
  const loadMoreBtn = document.getElementById('load-more-btn');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', async () => {
      await loadMoreMatches(false);
    });
  }

  // Switch buttons
  document.getElementById('recent-matches-btn').addEventListener('click', () => switchRightView('recent'));
  document.getElementById('elo-performance-btn').addEventListener('click', () => switchRightView('performance'));
  document.getElementById('last-30-btn').addEventListener('click', () => switchRightView('last30'));

  // Rank filters (pour performance)
  document.querySelectorAll('.rank-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.rank-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      currentRankFilter = this.dataset.rank;
      if (window._performanceData) {
        renderPerformance(window._performanceData);
      }
    });
  });

  loadDefault();
});