let currentPuuid = null;
let matchesOffset = 0;
let matchesLimit = 8;
let totalMatches = 0;
let roleChart = null;
let matchesGameModeFilter = 'all';
let matchesRoleFilter = 'all';
let eloGameModeFilter = 'all';
let currentLaneFilter = 'all';
let availableRoles = [];
let itemNames = {};
let sumspellNames = {};
let currentRightView = 'recent';
let currentRankFilter = 'all';
let currentSelectedMatchup = null;
let currentMatchGameId = null;
let previousView = 'recent';
let previousMatchup = null;

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
    'UTILITY': 'Support_icon',
    'SUPPORT': 'Support_icon'
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

    const status = await fetchJSON('/api/database-status');
    
    if (!status.has_data) {
      // Base de données vide → demander les infos
      showSetupModal();
      return;
    }

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

async function startDbUpdate(isFirstSetup = false) {
  const updateMessageBox = document.getElementById('update-box');
  const updateTextEl = document.getElementById('update-text');
  updateMessageBox.style.display = "block";
  updateTextEl.textContent = 'Update in progress ...';

  try {
    // Lance l'update en arrière-plan
    fetch('/api/database/update', { method: 'POST' });

    // Polling du progress
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/update-progress');
        console.log(res);
        if (!res.ok) return;

        const data = await res.json();
        const percent = Math.round(data.percent || 0);
        const timeLeft = Math.round(data.timeLeft || 0);
        updateTextEl.textContent = `Update in progress ... ${percent}% ... ${timeLeft} min left`;

        if (percent >= 100) {
          clearInterval(interval);
          updateTextEl.textContent = 'Update finished ! Reloading...';
          if (!isFirstSetup) {
            setTimeout(() => location.reload(), 2000);
          }
        }
      } catch (err) {
        console.error('Erreur polling progress:', err);
      }
    }, 1500);
  } catch (err) {
    updateTextEl.textContent = 'Erreur lors du lancement de la mise à jour.';
    console.error(err);
  }
}

// Fonction pour rendre les modales personnalisées (au lieu de confirm/alert)
function showConfirm(message, callback) {
  const modal = document.getElementById('custom-modal');
  document.getElementById('modal-message').textContent = message;
  document.getElementById('modal-cancel').style.display = 'flex';
  modal.style.display = 'flex';

  const okBtn = document.getElementById('modal-ok');
  const cancelBtn = document.getElementById('modal-cancel');

  okBtn.onclick = () => {
    modal.style.display = 'none';
    callback(true);
  };

  cancelBtn.onclick = () => {
    modal.style.display = 'none';
    callback(false);
  };
}

function showAlert(message) {
  const modal = document.getElementById('custom-modal');
  document.getElementById('modal-message').textContent = message;
  document.getElementById('modal-cancel').style.display = 'none';
  document.getElementById('modal-ok-text').textContent = 'Continue';

  modal.style.display = 'flex';

  document.getElementById('modal-ok').onclick = () => {
    modal.style.display = 'none';
  };
}

function showPrompt(message, callback) {
  const modal = document.getElementById('custom-modal');
  document.getElementById('modal-message').textContent = message;
  document.getElementById('modal-input').style.display = 'block';
  document.getElementById('modal-input').value = ''; // Vide le champ
  document.getElementById('modal-cancel').style.display = 'flex';
  modal.style.display = 'flex';

  const okBtn = document.getElementById('modal-ok');
  const cancelBtn = document.getElementById('modal-cancel');
  const input = document.getElementById('modal-input');

  // Focus sur l'input
  setTimeout(() => input.focus(), 100);

  const closeModal = () => {
    modal.style.display = 'none';
    document.getElementById('modal-input').style.display = 'none';
    okBtn.onclick = null;
    cancelBtn.onclick = null;
  };

  okBtn.onclick = () => {
    const value = input.value.trim();
    closeModal();
    callback(value || null); // Renvoie null si vide
  };

  cancelBtn.onclick = () => {
    closeModal();
    callback(null);
  };

  // Appui sur Entrée = OK
  input.addEventListener('keyup', function(e) {
    if (e.key === 'Enter') {
      okBtn.click();
    }
  });
}

function showSetupModal() {
  const modal = document.getElementById('custom-modal');
  const message = document.getElementById('modal-message');
  const input = document.getElementById('modal-input');
  const okBtn = document.getElementById('modal-ok');
  const cancelBtn = document.getElementById('modal-cancel');

  modal.style = "background: rgba(0, 0, 0, 0.9);"

  okBtn.onclick = null;
  cancelBtn.onclick = null;

  // Titre et message
  message.innerHTML = `
    <h3 style="margin-top:0;">Welcome !</h3>
    <p>Your database is currently empty.</p>
    <p>To start using this app, you must give :</p>
    <ul style="text-align:left; margin:8px 0; padding-left:20px;">
      <li>Your username (ex: Faker)</li>
      <li>Your usertag (ex: KR1)</li>
      <li>A valid RIOT API key</li>
    </ul>
  `;

  // On va créer 3 inputs
  input.style.display = 'none'; // on cache l'ancien input unique

  // Créer un conteneur pour les 3 champs
  let formContainer = document.getElementById('setup-form-container');
  if (!formContainer) {
    formContainer = document.createElement('div');
    formContainer.id = 'setup-form-container';
    formContainer.innerHTML = `
      <input type="text" id="setup-username" placeholder="Username (ex: Faker)" class="modal-form" style="margin-bottom:8px;">
      <input type="text" id="setup-tag" placeholder="Usertag (ex: KR1)" class="modal-form" style="margin-bottom:8px;">
      <input type="text" id="setup-api-key" placeholder="RIOT API key" class="modal-form">
    `;
    message.after(formContainer);
  }

  // Vider les champs
  document.getElementById('setup-username').value = '';
  document.getElementById('setup-tag').value = '';
  document.getElementById('setup-api-key').value = '';

  // Afficher la modale
  okBtn.querySelector('#modal-ok-text') ? okBtn.querySelector('#modal-ok-text').textContent = 'Proceed' : null;
  modal.style.display = 'flex';

  okBtn.onclick = async () => {

    const username = document.getElementById('setup-username').value.trim();
    const tag = document.getElementById('setup-tag').value.trim();
    const apiKey = document.getElementById('setup-api-key').value.trim();

    if (!username || !tag || !apiKey) {
      showAlert('Tous les champs sont obligatoires !');
      return;
    }

    // Désactiver les boutons
    okBtn.disabled = true;

    message.innerHTML += '<p style="margin-top:15px; color:#d7b04a;">Configuration en cours...</p>';

    try {
      // 1. Écrire toute la config en une fois
      const configRes = await fetch('/api/write-user-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summoner_name: username,
          summoner_tag: tag,
          api_key: apiKey
        })
      });

      if (!configRes.ok) {
        const err = await configRes.json();
        throw new Error(err.error || 'Erreur lors de l\'enregistrement de la configuration');
      }

      // 2. Récupérer le puuid
      const summonerRes = await fetch(`/api/add-summoner`, { method: 'POST' });
      if (summonerRes.status != 200) {
        const err = await summonerRes.json();
        throw new Error(err.error || 'Summoner could not be added to the database, verify the informations given');
      }

      // 3. Lancer l'update DB en background et poll le progress
      modal.style.display = 'none';
      startDbUpdate(true);

      setTimeout(() => {
        if (updateTextEl.textContent.includes('terminée')) {
          location.reload();
        }
      }, 5000);

    } catch (err) {
  
      console.error('Erreur configuration:', err);
      okBtn.disabled = false;
      cancelBtn.disabled = false;
      message.querySelector('p:last-child')?.remove();
      showAlert('Erreur : ' + err.message);
    }
  };

  // // Gestion Annuler
  // cancelBtn.onclick = () => {
  //   modal.style.display = 'none';
  //   showAlert('Vous devez configurer un profil pour utiliser le dashboard.');
  // };
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
      dateDiv.innerHTML = `<div class="match-date"><img src="static/assets/webUI/calendar.png" class="img-header" style="margin-top: -5px;">${date}</div>`;

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

        // Calcul des golds
        const gameDurationMins = m.gameDuration / 60;
        const totalGold = Math.round(m.goldEarned / 1000);
        const goldPerMin = (m.goldEarned / gameDurationMins).toFixed();
        const goldMinColor = getGoldMinColor(goldPerMin);
        const oppTotalGold = Math.round(m.opponent_gold / 1000);
        const oppGoldPerMin = (m.opponent_gold / gameDurationMins).toFixed();
        const oppGoldMinColor = getGoldMinColor(oppGoldPerMin);

        // Calcul CS par minute
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
        matchEl.style.cursor = 'pointer';
        matchEl.title = 'Click to see match details';
        matchEl.addEventListener('click', (e) => {
          e.stopPropagation();
          showMatchDetails(m.gameId);
        });
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
            <div class="match-gold">${m.totalMinionsKilled} (<span style="color: ${csMinColor}">${csPerMin}</span>) CS • ${totalGold}K (<span style="color: ${goldMinColor}">${goldPerMin}</span>) gold</div>
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
                <div class="opponent-gold">${m.opponent_cs} (<span style="color: ${opponentCsMinColor}">${opponentCsPerMin}</span>) CS • ${oppTotalGold}K (<span style="color: ${oppGoldMinColor}">${oppGoldPerMin}</span>) gold</div>
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
  const matchupSection = document.getElementById('matchup-stats-section');
  const matchupContent = document.getElementById('matchup-content');

  const recentBtn = document.getElementById('recent-matches-btn');
  const performanceBtn = document.getElementById('elo-performance-btn');
  const last30Btn = document.getElementById('last-30-btn');
  const matchupBtn = document.getElementById('matchup-stats-btn');

  // Masquer toutes les sections
  recentSection.style.display = 'none';
  performanceSection.style.display = 'none';
  last30Section.style.display = 'none';
  matchupSection.style.display = 'none';
  matchupContent.style.display = 'none';

  // Déactiver tous les boutons
  recentBtn.classList.remove('active');
  performanceBtn.classList.remove('active');
  last30Btn.classList.remove('active');
  matchupBtn.classList.remove('active');

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
  } else if (view === 'matchups') {
    matchupSection.style.display = 'flex';
    matchupContent.style.display = 'block';
    matchupBtn.classList.add('active');
    updateRoleButtons();
    await renderMatchups();
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

async function renderMatchups() {
  const url = `/api/matchup-stats?puuid=${currentPuuid}&role=${currentLaneFilter}`;
  const data = await fetchJSON(url);

  // Header principal
  document.getElementById('back-to-matchups-list').style.display = 'none';
  document.getElementById('back-from-matchup-games').style.display = 'none';
  document.getElementById('matchup-lane-selector').style.display = 'flex';
  document.getElementById('matchup-view-title').textContent = 'Matchup Stats';

  const container = document.getElementById('matchup-content');
  container.innerHTML = '';

  if (data.length === 0) {
    container.innerHTML = '<p>No matchups found for this lane.</p>';
    return;
  }

  data.forEach(matchup => {
    const matchupDiv = document.createElement('div');
    matchupDiv.style.cursor = 'pointer';
    matchupDiv.dataset.myChamp = matchup.my_champ;
    matchupDiv.dataset.myRole = matchup.my_role;
    matchupDiv.dataset.oppChamp = matchup.opp_champ;
    matchupDiv.dataset.oppRole = matchup.opp_role;

    // summoner stats
    const kda = (matchup.my_avg_kills + matchup.my_avg_assists) / matchup.my_avg_deaths;
    const formattedKDA = formatKDA(kda);
    const kdaColor = getKdaColor(kda);
    const csMinColor = getCSMinColor(matchup.my_cs_min);
    const goldMinColor = getGoldMinColor(matchup.my_gold_min);
    const totalGold = Math.round(matchup.my_avg_gold / 1000);
    const role = matchup.my_role;
    const roleIcon = roleToIcon(role);
    const champ = matchup.my_champ;

    // opponent stats
    const oppkda = (matchup.opp_avg_kills + matchup.opp_avg_assists) / matchup.opp_avg_deaths;
    const oppformattedKDA = formatKDA(oppkda);
    const oppkdaColor = getKdaColor(oppkda);
    const oppCsMinColor = getCSMinColor(matchup.opp_cs_min);
    const oppGoldMinColor = getGoldMinColor(matchup.opp_gold_min);
    const opptotalGold = Math.round(matchup.opp_avg_gold / 1000);
    const opprole = matchup.opp_role;
    const opproleIcon = roleToIcon(role);
    const oppchamp = matchup.opp_champ;

    let recentFormHtml = '';
    if (matchup.recent_form && matchup.recent_form.length > 0) {
      recentFormHtml = matchup.recent_form.map(res => {
        if (res === 'W') {
          return '<span style="color: var(--win); font-weight: bold;">W</span>';
        } else {
          return '<span style="color: var(--loss); font-weight: bold;">L</span>';
        }
      }).join('');
    } else {
      recentFormHtml = '—';
    }

    matchupDiv.className = 'card matchup-block';
    matchupDiv.innerHTML = `
      <div class="matchup-header" style="text-align: center;">
        <div class="champ-icon-wrapper">
          <img src="static/assets/champion/${champ.replace(/\s+/g, '')}.png" alt="${champ}" class="match-champ-icon" title="${champ}">
          <img src="static/assets/roles/${roleIcon}.png" alt="${role}" class="match-role-icon" title="${role}">
        </div>
        <span>vs</span>
        <div class="champ-icon-wrapper">
          <img src="static/assets/champion/${oppchamp.replace(/\s+/g, '')}.png" alt="${oppchamp}" class="match-champ-icon" title="${oppchamp}">
          <img src="static/assets/roles/${opproleIcon}.png" alt="${opprole}" class="match-role-icon" title="${opprole}">
        </div>
        <p>Games: ${matchup.matches} • Winrate: ${matchup.winrate}%</p>
        <span>Recent Form: ${recentFormHtml}</span>
      </div>

      <div class="summoner-section">
        <h3>Average Stats</h3>
        <div class="match-kda-line">
          <span class="match-kills">${matchup.my_avg_kills}</span> / 
          <span class="match-deaths">${matchup.my_avg_deaths}</span> / 
          <span class="match-assists">${matchup.my_avg_assists}</span> |
          <span class="match-kda" style="color: ${kdaColor}">${formattedKDA} KDA</span>
        </div>
        <div class="match-gold">${matchup.my_avg_cs} (<span style="color: ${csMinColor}">${matchup.my_cs_min}</span>) CS • ${totalGold}K (<span style="color: ${goldMinColor}">${matchup.my_gold_min}</span>) gold</div>
      </div>

      <div class="opponent-section">
        <h3>Opponents Average Stats</h3>
        <div class="match-kda-line">
          <span class="match-kills">${matchup.opp_avg_kills}</span> / 
          <span class="match-deaths">${matchup.opp_avg_deaths}</span> / 
          <span class="match-assists">${matchup.opp_avg_assists}</span> |
          <span class="match-kda" style="color: ${oppkdaColor}">${oppformattedKDA} KDA</span>
        </div>
        <div class="match-gold">${matchup.opp_avg_cs} (<span style="color: ${oppCsMinColor}">${matchup.opp_cs_min}</span>) CS • ${opptotalGold}K (<span style="color: ${oppGoldMinColor}">${matchup.opp_gold_min}</span>) gold</div>
      </div>
    `;

    matchupDiv.addEventListener('click', () => {
      currentSelectedMatchup = {
        my_champ: matchup.my_champ,
        my_role: matchup.my_role,
        opp_champ: matchup.opp_champ,
        opp_role: matchup.opp_role
      };
      showMatchupGames();
    });

    container.appendChild(matchupDiv);
  });
}

async function showMatchupGames() {
  if (!currentSelectedMatchup) return;

  const { my_champ, my_role, opp_champ, opp_role } = currentSelectedMatchup;
  previousView = "matchups-detailed";
  previousMatchup = currentSelectedMatchup;

  // Afficher le bouton retour et changer le titre
  document.getElementById('back-to-matchups-list').style.display = 'flex';
  document.getElementById('back-from-matchup-games').style.display = 'none';
  document.getElementById('matchup-lane-selector').style.display = 'none';
  document.getElementById('matchup-view-title').textContent = `${my_champ} vs ${opp_champ} (${my_role})`;

  // Masquer la liste des matchups
  document.getElementById('matchup-content').innerHTML = '<p>Chargement des matchs...</p>';

  try {
    // Charger tous les matchs (limite haute pour tout récupérer)
    const url = `/api/matches?puuid=${currentPuuid}&limit=500&offset=0&gameMode=all&role=all`;
    const response = await fetchJSON(url);
    let allMatches = response.matches;

    // Filtrer les matchs correspondant au matchup sélectionné
    const filteredMatches = allMatches.filter(m => {
      return (
        m.champion_name.toUpperCase() === my_champ.toUpperCase() &&
        (m.position || 'UNKNOWN').toUpperCase() === my_role.toUpperCase() &&
        m.opponent_champion.toUpperCase() === opp_champ.toUpperCase() &&
        (m.opponent_role || 'UNKNOWN').toUpperCase() === opp_role.toUpperCase()
      );
    });

    const container = document.getElementById('matchup-content');
    container.innerHTML = ''; // Vider le contenu

    if (filteredMatches.length === 0) {
      container.innerHTML = '<p>Aucun match trouvé pour ce matchup.</p>';
      return;
    }

    // Grouper par date (comme dans loadMoreMatches)
    const matchesByDate = {};
    filteredMatches.forEach(m => {
      const date = formatTimestamp(m.gameEndTimestamp);
      if (!matchesByDate[date]) matchesByDate[date] = [];
      matchesByDate[date].push(m);
    });

    Object.entries(matchesByDate).forEach(([date, dayMatches]) => {
      const dateDiv = document.createElement('div');
      dateDiv.className = 'match-date-group';
      dateDiv.innerHTML = `<div class="match-date"><img src="static/assets/webUI/calendar.png" class="img-header" style="margin-top: -5px;">${date}</div>`;

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

        const gameDurationMins = m.gameDuration / 60;
        const csPerMin = (m.totalMinionsKilled / gameDurationMins).toFixed(1);
        const opponentCsPerMin = (m.opponent_cs / gameDurationMins).toFixed(1);
        const csMinColor = getCSMinColor(csPerMin);
        const opponentCsMinColor = getCSMinColor(opponentCsPerMin);

        const playerItems = [m.item0, m.item1, m.item2, m.item3, m.item4, m.item5].filter(i => i);
        const playerItemsHtml = renderItemSlots(playerItems, m.summoner1Id, m.summoner2Id, 1);

        const opponentItems = [m.opponent_item0, m.opponent_item1, m.opponent_item2, m.opponent_item3, m.opponent_item4, m.opponent_item5].filter(i => i);
        const opponentItemsHtml = renderItemSlots(opponentItems, m.opponent_summoner1Id, m.opponent_summoner2Id, 0.8);

        // Calcul des golds
        const totalGold = Math.round(m.goldEarned / 1000);
        const goldPerMin = (m.goldEarned / gameDurationMins).toFixed();
        const goldMinColor = getGoldMinColor(goldPerMin);
        const oppTotalGold = Math.round(m.opponent_gold / 1000);
        const oppGoldPerMin = (m.opponent_gold / gameDurationMins).toFixed();
        const oppGoldMinColor = getGoldMinColor(oppGoldPerMin);

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
            <div class="match-gold">${m.totalMinionsKilled} (<span style="color: ${csMinColor}">${csPerMin}</span>) CS • ${totalGold}K (<span style="color: ${goldMinColor}">${goldPerMin}</span>) gold</div>
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
                <div class="opponent-gold">${m.opponent_cs} (<span style="color: ${opponentCsMinColor}">${opponentCsPerMin}</span>) CS • ${oppTotalGold}K (<span style="color: ${oppGoldMinColor}">${oppGoldPerMin}</span>) gold</div>
              </div>
              ${opponentItemsHtml}
            </div>
          </div>
        `;

        matchEl.style.cursor = 'pointer';
        matchEl.title = 'Click to see match details';
        matchEl.addEventListener('click', (e) => {
          e.stopPropagation();
          showMatchDetails(m.gameId);
        });

        dateDiv.appendChild(matchEl);
      });

      container.appendChild(dateDiv);
    });

  } catch (err) {
    console.error('Erreur lors du chargement des matchs du matchup:', err);
    container.innerHTML = '<p>Erreur lors du chargement des matchs.</p>';
  }
}

function renderRoleLine(bluePlayer, redPlayer, role) {

  // roleIcon and gameDuration
  const roleIcon = roleToIcon(role);
  const gameDurationMins = bluePlayer.gameDuration / 60;

  // Blue player
  bKDA = bluePlayer.kills + bluePlayer.assists;
  if ( bluePlayer.deaths > 0 ) { bKDA = bKDA / bluePlayer.deaths };
  const bKDAColor = getKdaColor(bKDA);
  const bFormattedKDA = formatKDA(bKDA);
  const bChampIcon = bluePlayer.championName.replace(/\s+/g, ''); 
  const bCSPerMin = ((bluePlayer.totalMinionsKilled + bluePlayer.neutralMinionsKilled) / gameDurationMins).toFixed(1);
  const bCSMinColor = getCSMinColor(bCSPerMin);
  const bTotalGold = Math.round(bluePlayer.goldEarned / 1000);
  const bGoldPerMin = (bluePlayer.goldEarned / gameDurationMins).toFixed(1);
  const bGoldMinColor = getGoldMinColor(bGoldPerMin);

  const bPlayerItems = [bluePlayer.item0, bluePlayer.item1, bluePlayer.item2, bluePlayer.item3, bluePlayer.item4, bluePlayer.item5].filter(i => i);
  const bPlayerItemsHtml = renderItemSlots(bPlayerItems, bluePlayer.summoner1Id, bluePlayer.summoner2Id, 1);

  // Red player
  rKDA = redPlayer.kills + redPlayer.assists;
  if ( redPlayer.deaths > 0 ) { rKDA = rKDA / redPlayer.deaths };
  const rKDAColor = getKdaColor(rKDA);
  const rFormattedKDA = formatKDA(rKDA);
  const rChampIcon = redPlayer.championName.replace(/\s+/g, ''); 
  const rCSPerMin = ((redPlayer.totalMinionsKilled + redPlayer.neutralMinionsKilled) / gameDurationMins).toFixed(1);
  const rCSMinColor = getCSMinColor(rCSPerMin);
  const rTotalGold = Math.round(redPlayer.goldEarned / 1000);
  const rGoldPerMin = (redPlayer.goldEarned / gameDurationMins).toFixed(1);
  const rGoldMinColor = getGoldMinColor(rGoldPerMin);

  const rPlayerItems = [redPlayer.item0, redPlayer.item1, redPlayer.item2, redPlayer.item3, redPlayer.item4, redPlayer.item5].filter(i => i);
  const rPlayerItemsHtml = renderItemSlots(rPlayerItems, redPlayer.summoner1Id, redPlayer.summoner2Id, 1);

  innerHTML = `

    ${bPlayerItemsHtml}

    <div class="match-stats">
      <div class="match-kda-line">
        <span class="match-kills">${bluePlayer.kills}</span> / 
        <span class="match-deaths">${bluePlayer.deaths}</span> / 
        <span class="match-assists">${bluePlayer.assists}</span> |
        <span class="match-kda" style="color: ${bKDAColor}">${bFormattedKDA} KDA</span>
      </div>
      <div class="match-gold">${bluePlayer.totalMinionsKilled + bluePlayer.neutralMinionsKilled} (<span style="color: ${bCSMinColor}">${bCSPerMin}</span>) CS • ${bTotalGold}K (<span style="color: ${bGoldMinColor}">${bGoldPerMin}</span>) gold</div>
    </div>

    <div class="match-champ">
      <div class="champ-wrapper">
        <img src="static/assets/champion/${bChampIcon}.png" alt="${bluePlayer.champion_name}" class="match-champ-icon">
      </div>
    </div>

    <div class="role-center">
      <img src="static/assets/roles/${roleIcon}.png" alt="${role}">
    </div>

    <div class="match-champ">
      <div class="champ-wrapper">
        <img src="static/assets/champion/${rChampIcon}.png" alt="${redPlayer.champion_name}" class="match-champ-icon">
      </div>
    </div>

    <div class="match-stats">
      <div class="match-kda-line">
        <span class="match-kills">${redPlayer.kills}</span> / 
        <span class="match-deaths">${redPlayer.deaths}</span> / 
        <span class="match-assists">${redPlayer.assists}</span> |
        <span class="match-kda" style="color: ${rKDAColor}">${rFormattedKDA} KDA</span>
      </div>
      <div class="match-gold">${redPlayer.totalMinionsKilled + redPlayer.neutralMinionsKilled} (<span style="color: ${rCSMinColor}">${rCSPerMin}</span>) CS • ${rTotalGold}K (<span style="color: ${rGoldMinColor}">${rGoldPerMin}</span>) gold</div>
    </div>

    ${rPlayerItemsHtml}
  `;

  return innerHTML
}

async function showMatchDetails(gameId) {
  currentMatchGameId = gameId;
  currentRightView = 'match-details';

  // 1. Masquer TOUTES les autres sections de right-col
  document.getElementById('recent-matches-section').style.display = 'none';
  document.getElementById('elo-performance-section').style.display = 'none';
  document.getElementById('last-30-section').style.display = 'none';
  document.getElementById('matchup-stats-section').style.display = 'none';
  document.getElementById('matchup-content').style.display = 'none';

  // 2. Afficher la section des détails du match
  const detailsSection = document.getElementById('match-details-section');
  if (detailsSection) {
    detailsSection.style.display = 'block';
    console.log('Section match-details affichée');
  } else {
    console.error('Élément #match-details-section introuvable dans le DOM');
    return;
  }

  const container = document.getElementById('match-details-content');
  container.innerHTML = '<p>Chargement des détails du match...</p>';

  try {
    const data = await fetchJSON(`/api/match-details?gameId=${gameId}`);

    container.innerHTML = '';

    // Stats équipes
    const blueTeam = data.teams.find(t => t.teamId === 100) || {};
    const redTeam = data.teams.find(t => t.teamId === 200) || {};
    const date = formatTimestamp(data.participants[1].gameEndTimestamp);

    const dateDiv = document.createElement('div');

    dateDiv.className = 'match-date-group';
    dateDiv.style = "margin-bottom: -10px;"
    dateDiv.innerHTML = `<div class="match-date"><img src="static/assets/webUI/calendar.png" class="img-header" style="margin-top: -5px;">${date}</div>`;

    container.appendChild(dateDiv);

    const teamDiv = document.createElement('div');
    teamDiv.className = 'team-stats-row';
    teamDiv.innerHTML = `
      <div class="team-stats-blue">
        <div class="objectives">
          <img src="static/assets/objectives/nashor.png" class="img-objectives">
          <p>${blueTeam.baron || 0}</p>
        </div>
        <div class="objectives">
          <img src="static/assets/objectives/dragon.png" class="img-objectives">
          <p>${blueTeam.dragon || 0}</p>
        </div>
        <div class="objectives">
          <img src="static/assets/objectives/inhibitor.png" class="img-objectives">
          <p>${blueTeam.inhibitor || 0}</p>
        </div>
        <div class="objectives">
          <img src="static/assets/objectives/tower.png" class="img-objectives">
          <p>${blueTeam.tower || 0}</p>
        </div>
        <h3>Blue team ${blueTeam.win === '1' ? '(Victory)' : '(Defeat)'}</h3>
      </div>
      <div class="team-stats-red">
        <h3>Red team ${redTeam.win === '1' ? '(Victory)' : '(Defeat)'}</h3>
        <div class="objectives">
          <img src="static/assets/objectives/tower.png" class="img-objectives">
          <p>${redTeam.tower || 0}</p>
        </div>
        <div class="objectives">
          <img src="static/assets/objectives/inhibitor.png" class="img-objectives">
          <p>${redTeam.inhibitor || 0}</p>
        </div>
        <div class="objectives">
          <img src="static/assets/objectives/dragon.png" class="img-objectives">
          <p>${redTeam.dragon || 0}</p>
        </div>
        <div class="objectives">
          <img src="static/assets/objectives/nashor.png" class="img-objectives">
          <p>${redTeam.baron || 0}</p>
        </div>
      </div>
    `;
    container.appendChild(teamDiv);

    // Matchups par rôle
    const rolesOrder = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'SUPPORT'];

    rolesOrder.forEach(role => {
      const bluePlayer = data.participants.find(p => p.teamId === 100 && (p.individualPosition || '').toUpperCase() === role) || null;
      const redPlayer = data.participants.find(p => p.teamId === 200 && (p.individualPosition || '').toUpperCase() === role) || null;

      const row = document.createElement('div');
      row.className = 'role-matchup-row';
      row.innerHTML = renderRoleLine(bluePlayer, redPlayer, role);

      container.appendChild(row);
    });

  } catch (err) {
    container.innerHTML = '<p>Erreur lors du chargement des détails du match.</p>';
    console.error(err);
  }
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

  document.getElementById('back-from-details').addEventListener('click', () => {
    document.getElementById('match-details-section').style.display = 'none';
    document.getElementById('matchup-stats-section').style.display = 'flex';
    document.getElementById('matchup-content').style.display = 'block';


    if (previousView === 'matchups-detailed' && previousMatchup) {
      // On revient à la liste des matchs du matchup
      currentSelectedMatchup = previousMatchup;
      showMatchupGames(); // ← cela mettra à jour le header correctement
    } else {
      switchRightView(previousView || 'recent');
    }
  });

  document.getElementById('back-to-matchups-list').addEventListener('click', () => {
    currentSelectedMatchup = null;
    renderMatchups();
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
document.getElementById('db-update-btn').addEventListener('click', () => {
  startDbUpdate(false); // Sans confirm
});

document.getElementById('db-delete-btn').addEventListener('click', () => {
  showConfirm('This will delete ALL DATA from the database. Are you sure?', async (confirmed) => {
    if (confirmed) {
      try {
        const res = await fetch('/api/database/delete', { method: 'POST' });
        const data = await res.json();
        showAlert(data.message || 'Database cleared');
        location.reload();
      } catch (err) {
        showAlert('Error: ' + err.message);
      }
    }
  });
});

// API key buttons
  document.getElementById('test-api-btn').addEventListener('click', async () => {
    try {
      const res = await fetch('/api/test-api-key');
      const data = await res.json();
      if (res.ok) {
        showAlert(data.message);
      } else {
        showAlert(data.error);
      }
    } catch (err) {
      showAlert('Error: ' + err.message);
    }
  });

  document.getElementById('update-api-btn').addEventListener('click', () => {
  showPrompt('Enter new API key:', async (newKey) => {
    if (newKey !== null && newKey.trim() !== '') {
      try {
        const res = await fetch('/api/update-api-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: newKey.trim() })
        });
        const data = await res.json();
        if (res.ok) {
          showAlert(data.message || 'API key updated successfully');
        } else {
          showAlert(data.error || 'Failed to update API key');
        }
      } catch (err) {
        showAlert('Error: ' + err.message);
      }
    }
    // Si newKey === null → annulation → rien à faire
  });
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
  document.getElementById('matchup-stats-btn').addEventListener('click', () => switchRightView('matchups'));

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

  // Lane filters for matchups
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      if (this.disabled) return;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      currentLaneFilter = this.dataset.value;
      renderMatchups();
    });
  });

  document.getElementById('back-to-matchups-list').addEventListener('click', () => {
    currentSelectedMatchup = null;
    document.getElementById('back-to-matchups-list').style.display = 'none';
    document.getElementById('matchup-lane-selector').style.display = 'flex';
    document.getElementById('matchup-view-title').textContent = 'Matchup Stats';
    renderMatchups(); // Recharge la liste des matchups
  });

  loadDefault();
});