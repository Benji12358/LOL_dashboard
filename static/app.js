let currentPuuid = null;
let matchesOffset = 0;
let matchesLimit = 10;
let totalMatches = 0;
let roleChart = null;
let currentGameModeFilter = 'all';
let currentRoleFilter = 'all';
let availableRoles = [];
let itemNames = {};
let sumspellNames = {};

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
  const roleIconMap = {
    'TOP': 'static/assets/roles/Top_icon.png',
    'JUNGLE': 'static/assets/roles/Jungle_icon.png',
    'MIDDLE': 'static/assets/roles/Middle_icon.png',
    'BOTTOM': 'static/assets/roles/Adc_icon.png',
    'SUPPORT': 'static/assets/roles/Support_icon.png'
  };
  
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
  const ranks = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER'];
  const baseDivisions = ['IV', 'III', 'II', 'I'];
  
  // Build data structure: rank -> division -> count
  const rankDivisionMap = {};
  ranks.forEach(rank => {
    rankDivisionMap[rank] = {};
    // MASTER only has division I
    const divisions = rank === 'MASTER' ? ['I'] : baseDivisions;
    divisions.forEach(div => {
      rankDivisionMap[rank][div] = 0;
    });
  });

  // Filter opponents by current game mode if set
  const filteredOpponents = (currentGameModeFilter && currentGameModeFilter !== 'all')
    ? opponents.filter(o => (o.gameMode || '').toLowerCase() === currentGameModeFilter.toLowerCase())
    : opponents;

  // Count opponents by rank/division
  filteredOpponents.forEach(opp => {
    const rankStr = opp.rank || opp.current_rank || '';
    const parts = rankStr.trim().split('_');
    if (parts.length === 2) {
      const rank = parts[0].toUpperCase();
      const division = parts[1].toUpperCase();
      if (rankDivisionMap[rank] && rankDivisionMap[rank][division] !== undefined) {
        rankDivisionMap[rank][division]++;
      }
    }
  });

  const labels = ranks;
  const divisionsOrder = ['IV', 'III', 'II', 'I'];
  const datasets = divisionsOrder.map(div => {
    const data = labels.map(rank => rankDivisionMap[rank][div] || 0);
    return {
      _division: div,
      label: `Division ${div}`,
      data: data,
      backgroundColor: '#d7b04a',
      borderColor: '#b8951f',
      borderWidth: 1,
      barThickness: 8,
      maxBarThickness: 12
    };
  }).filter(ds => ds.data.some(v => v > 0));

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
          bottom: 25,  // espace pour icons et text
          top: 5
        }
      },
      scales: {
        y: {
          display: false,
          beginAtZero: true,
          stacked: false
        },
        x: {
          ticks: { display: false },
          grid: { display: true }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.8)',
          bodyFont: { size: 12 },
          callbacks: {
            label: function(context) {
              const div = context.dataset._division || context.dataset.label;
              const count = context.parsed.y;
              return `${div}: ${count}`;
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
        if (!meta || !meta.data) return;

        if (!window._rankIconCache) window._rankIconCache = {};

        labels.forEach((rank, idx) => {
          const imgPath = `static/assets/rank/rank_${rank.toLowerCase()}.png`;
          if (!window._rankIconCache[imgPath]) {
            const img = new Image();
            img.src = imgPath;
            window._rankIconCache[imgPath] = img;
          }
          const img = window._rankIconCache[imgPath];
          const bar = meta.data[idx];
          if (!bar) return;
          const barX = bar.x;
          const baseY = chartArea.bottom + 6;
          const iconSize = 28;
          if (img && img.complete) {
            ctx.drawImage(img, barX - iconSize/2, baseY, iconSize, iconSize);
          }
        });
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
      `/api/matches?puuid=${currentPuuid}&limit=${matchesLimit}&offset=${matchesOffset}&gameMode=${currentGameModeFilter}&role=${currentRoleFilter}`
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

// Setup filter buttons
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const filterType = this.dataset.filter;
      const filterValue = this.dataset.value;

      // Update active state
      document.querySelectorAll(`.filter-btn[data-filter="${filterType}"]`).forEach(b => {
        b.classList.remove('active');
      });
      this.classList.add('active');

      // Update filter variables
      if (filterType === 'gameMode') {
        currentGameModeFilter = filterValue;
      } else if (filterType === 'role') {
        currentRoleFilter = filterValue;
      }

      // Reload matches
      loadMoreMatches(true);

      // If opponent data exists, redraw opponent elo chart with the new gameMode filter
      if (filterType === 'gameMode' && window._lastOpponentData) {
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
  });

  // Load more matches button
  const loadMoreBtn = document.getElementById('load-more-btn');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', async () => {
      await loadMoreMatches(false);
    });
  }

  loadDefault();
});