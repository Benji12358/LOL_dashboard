from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
from database import DatabaseManager
import logging
import sys
import os
import json
from config import Config  # Import Config
from api_handler import APIHandler  # Import APIHandler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)

db = DatabaseManager()
config = Config()  # Instance of Config

@app.route('/')
def index():
    """Render the main dashboard"""
    return render_template('index.html')

@app.route('/champions')
def champions_page():
    """Render the champions page"""
    return render_template('champions.html')

@app.route('/matches')
def matches_page():
    """Render the matches page"""
    return render_template('matches.html')

@app.route('/api/add-summoner', methods=['POST'])
def api_add_summoner():
    """
    Add summoner from infos in config file.
    """
    try:
        api = APIHandler()
        db.create_tables()
        user_config = config.read_user_config()
        url_config = config.read_url_config()

        api.test_api_connection(user_config, url_config)
        account_puiid = api.fetch_puuid(user_config, url_config)
        account_rank = api.fetch_summoner_rank(url_config, user_config, account_puiid)
        
        summoner = {
            "summoner_name": user_config['gameName'],
            "summoner_tag": user_config['tagLine'],
            "puuid": account_puiid,
            "current_rank": account_rank
        }
        if db.insert_summoner(summoner) == 1:
            return jsonify({'success': True, 'message': 'Summoner added to database !'})
        else:
            return jsonify({'success': False, 'message': 'Summoner could not be added to database'}), 400
    except Exception as e:
        logger.error(f"api_summoner_by_name error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/summoner-by-name')
def api_summoner_by_name():
    try:
        full_name = request.args.get('name', '').strip()
        if not full_name:
            return jsonify({'error': 'name parameter required'}), 400
        
        # Gérer Username#Tag
        if '#' in full_name:
            name, tag = full_name.split('#', 1)
        else:
            name = full_name
            tag = None  # Ou une valeur par défaut si besoin

        filters = {'summoner_name': name}
        if tag:
            filters['summoner_tag'] = tag

        summoners = db.fetch_data('summoner', filters=filters)
        if summoners:
            return jsonify(summoners[0])
        
        # Si pas dans DB, fetch depuis Riot et add
        api = APIHandler()
        user_config = config.read_user_config()
        url_config = config.read_url_config()
        puuid = api.fetch_puuid(user_config, url_config, name, tag)  # Adapte si ta fonction fetch_puuid accepte name/tag
        
        if not puuid:
            return jsonify({'error': 'summoner not found in Riot API'}), 404
        
        # Ajoute à la DB (adapte les champs)
        db.insert_data('summoner', {
            'puuid': puuid,
            'summoner_name': name,
            'summoner_tag': tag
        })

        return jsonify({
            'puuid': puuid,
            'summoner_name': name,
            'summoner_tag': tag
        })
    
    except Exception as e:
        logger.error(f"api_summoner_by_name error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/update-progress')
def api_update_progress():
    """
    Retourne le contenu de progress.json pour le polling du frontend
    """
    progress_file = 'progress.json'
    try:
        if os.path.exists(progress_file):
            with open(progress_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            # On s'assure que 'percent' est toujours présent
            if 'percent' not in data:
                data['percent'] = 0
            return jsonify(data)
        else:
            return jsonify({'percent': 0})
    except Exception as e:
        logger.error(f"Erreur lecture progress.json : {e}")
        return jsonify({'percent': 0})

@app.route('/api/summary')
def api_summary():
    """
    Returns overall summary for a summoner.
    Query params:
      - puuid (required)
    """
    try:
        puuid = request.args.get('puuid', '').strip()
        if not puuid:
            return jsonify({'error': 'puuid required'}), 400

        # Filter out remakes and ARAM with gameStatusProcess field
        parts = db.fetch_data('game_participants', filters={'puuid': puuid, 'gameStatusProcess': 'Normal'})
        if not parts:
            return jsonify({'error': 'no matches found'}), 404

        total_games = len({p['gameId'] for p in parts})
        total_kills = sum((p.get('kills') or 0) for p in parts)
        total_deaths = sum((p.get('deaths') or 0) for p in parts)
        total_assists = sum((p.get('assists') or 0) for p in parts)

        wins = 0
        losses = 0
        seen_games = set()
        for p in parts:
            gid = p.get('gameId')
            if gid in seen_games:
                continue
            seen_games.add(gid)
            team_rows = db.fetch_data('game_team', filters={'gameId': gid, 'teamId': p.get('teamId')})
            if team_rows:
                win_val = team_rows[0].get('win')
                win_flag = str(win_val).lower() in ('true', 't', '1', 'yes', 'y', 'win') if win_val else False
                if win_flag:
                    wins += 1
                else:
                    losses += 1

        winrate = (wins / max(1, (wins + losses))) * 100 if (wins + losses) > 0 else 0.0
        kda = (total_kills + total_assists) / max(1, total_deaths)
        avg_kda = kda / max(1, total_games) if total_games > 0 else kda

        summoner_row = db.fetch_data('summoner', filters={'puuid': puuid})
        summoner = summoner_row[0] if summoner_row else {'puuid': puuid}

        return jsonify({
            'summoner': summoner,
            'total_games': total_games,
            'wins': wins,
            'losses': losses,
            'winrate': round(winrate, 2),
            'total_kills': total_kills,
            'total_deaths': total_deaths,
            'total_assists': total_assists,
            'kda': round(kda, 2),
            'avg_kda': round(avg_kda, 2)
        })
    except Exception as e:
        logger.error(f"api_summary error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/champions')
def api_champions():
    """
    Aggregated performance per champion for a summoner.
    Query params:
      - puuid (required)
    """
    try:
        puuid = request.args.get('puuid', '').strip()
        if not puuid:
            return jsonify({'error': 'puuid required'}), 400

        parts = db.fetch_data('game_participants', filters={'puuid': puuid})
        if not parts:
            return jsonify([])

        by_champ = {}
        for p in parts:
            champ = p.get('championName') or 'unknown'
            entry = by_champ.setdefault(champ, {
                'matches': 0, 'wins': 0, 'losses': 0, 
                'kills': 0, 'deaths': 0, 'assists': 0,
                'cs': 0, 'duration': 0
            })
            entry['matches'] += 1
            entry['kills'] += (p.get('kills') or 0)
            entry['deaths'] += (p.get('deaths') or 0)
            entry['assists'] += (p.get('assists') or 0)
            entry['cs'] += (p.get('totalMinionsKilled') + p.get('neutralMinionsKilled') or 0)
            entry['duration'] += (int(p.get('gameDuration') or 0))

            gid = p.get('gameId')
            team_rows = db.fetch_data('game_team', filters={'gameId': gid, 'teamId': p.get('teamId')})
            if team_rows:
                w = team_rows[0].get('win')
                win_flag = str(w).lower() in ('true', 't', '1', 'yes', 'y', 'win') if w else False
                if win_flag:
                    entry['wins'] += 1
                else:
                    entry['losses'] += 1

        out = []
        for champ, v in by_champ.items():
            matches = v['matches']
            wins = v['wins']
            losses = v['losses']
            avg_kills = v['kills'] / matches if matches else 0
            avg_deaths = v['deaths'] / matches if matches else 0
            avg_assists = v['assists'] / matches if matches else 0
            avg_cs = v['cs'] / matches if matches else 0
            avg_duration = v['duration'] / matches if matches else 0
            avg_kda = (avg_kills + avg_assists) / max(1, avg_deaths)
            winrate = (wins / max(1, (wins + losses))) * 100 if (wins + losses) > 0 else 0.0
            out.append({
                'champion_name': champ,
                'matches': matches,
                'wins': wins,
                'losses': losses,
                'winrate': round(winrate, 1),
                'avg_kills': round(avg_kills, 1),
                'avg_deaths': round(avg_deaths, 1),
                'avg_assists': round(avg_assists, 1),
                'avg_kda': round(avg_kda, 1),
                'avg_cs': round(avg_cs, 1),
                'avg_duration': avg_duration
            })

        out.sort(key=lambda x: x['matches'], reverse=True)
        return jsonify(out)
    except Exception as e:
        logger.error(f"api_champions error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/database-status')
def api_database_status():
    """
    Retourne si la base de données contient au moins un summoner.
    """
    try:
        summoners = db.fetch_data('summoner')
        has_summoner = len(summoners) > 0
        return jsonify({'has_data': has_summoner})
    except Exception as e:
        logger.error(f"api_database_status error: {e}")
        return jsonify({'has_data': False, 'error': str(e)}), 500

@app.route('/api/summoner-default')
def api_summoner_default():
    """
    Get first summoner from database.
    """
    try:
        summoners = db.fetch_data('summoner')
        if summoners:
            return jsonify(summoners[0])
        return jsonify({'error': 'no summoner in database'}), 404
    except Exception as e:
        logger.error(f"api_summoner_default error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/matches')
def api_matches():
    """
    Return list of matches for a puuid with pagination and filters.
    Query params:
      - puuid (required)
      - limit (optional, default 10)
      - offset (optional, default 0)
      - gameMode (optional: all, normal, solo, flex, swiftplay)
      - role (optional: all, TOP, JUNGLE, MIDDLE, BOTTOM, SUPPORT)
    """
    try:
        puuid = request.args.get('puuid', '').strip()
        if not puuid:
            return jsonify({'error': 'puuid required'}), 400

        limit = int(request.args.get('limit') or 10)
        offset = int(request.args.get('offset') or 0)
        gameMode = request.args.get('gameMode', 'all').lower()
        role = request.args.get('role', 'all').upper()

        parts = db.fetch_data('game_participants', filters={'puuid': puuid})
        
        # Filter out remakes
        parts = [p for p in parts if p.get('gameStatusProcess') != 'Avoid']

        # Filter by game mode
        if gameMode != 'all':
            gameModeFull = {
                'normal': 'Normal Draft',
                'solo': 'Ranked Solo',
                'flex': 'Ranked Flex',
                'swiftplay': 'Swift Play'
            }.get(gameMode, '')
            if gameModeFull:
                parts = [p for p in parts if p.get('gameMode') == gameModeFull]

        # Filter by role
        if role != 'ALL':
            role_map = {
                'TOP': 'TOP',
                'JUNGLE': 'JUNGLE',
                'MIDDLE': 'MIDDLE',
                'BOTTOM': 'BOTTOM',
                'UTILITY': 'UTILITY'
            }
            role_normalized = role_map.get(role, role)
            parts = [p for p in parts if (p.get('individualPosition') or '').upper() == role_normalized]

        games = {}
        for p in parts:
            gid = p.get('gameId')
            if gid not in games:
                games[gid] = p
        
        game_list = sorted(games.values(), 
                          key=lambda x: int(x.get('gameEndTimestamp') or 0), 
                          reverse=True)
        
        paginated = game_list[offset:offset + limit]
        
        out = []
        for p in paginated:
            gid = p.get('gameId')
            kills = p.get('kills') or 0
            deaths = p.get('deaths') or 0
            assists = p.get('assists') or 0
            kda = round((kills + assists) / max(1, deaths), 2)
            position = p.get('individualPosition') or 'UNKNOWN'
            game_timestamp = int(p.get('gameEndTimestamp') or 0)
            game_duration = int(p.get('gameDuration') or 0)
            game_mode = p.get('gameMode') or 'Unknown'
            
            opponent_champ = 'Unknown'
            opponent_team = 200 if p.get('teamId') == 100 else 100
            opponents = db.fetch_data('game_participants', filters={
                'gameId': gid,
                'teamId': opponent_team,
                'individualPosition': position
            })
            opponent_kills = 0
            opponent_deaths = 0
            opponent_assists = 0
            opponent_kda = 0.0
            opponent_cs = 0
            opponent_gold = 0
            opponent_items = [0] * 6
            opponent_summoner1 = 0
            opponent_summoner2 = 0
            
            if opponents:
                opp = opponents[0]
                opponent_champ = opp.get('championName') or 'Unknown'
                opponent_kills = opp.get('kills') or 0
                opponent_deaths = opp.get('deaths') or 0
                opponent_assists = opp.get('assists') or 0
                opponent_kda = round((opponent_kills + opponent_assists) / max(1, opponent_deaths), 2)
                opponent_cs = (opp.get('totalMinionsKilled') + opp.get('neutralMinionsKilled') or 0)
                opponent_gold = opp.get('goldEarned') or 0
                opponent_items = [opp.get(f'item{i}') or 0 for i in range(6)]
                opponent_summoner1 = opp.get('summoner1Id') or 0
                opponent_summoner2 = opp.get('summoner2Id') or 0
            
            team_rows = db.fetch_data('game_team', filters={'gameId': gid, 'teamId': p.get('teamId')})
            win = False
            if team_rows:
                w = team_rows[0].get('win')
                if isinstance(w, str):
                    win = w.lower() in ('true', 't', '1', 'yes', 'y', 'win')
            
            items = [p.get(f'item{i}') or 0 for i in range(6)]
            summoner1 = p.get('summoner1Id') or 0
            summoner2 = p.get('summoner2Id') or 0

            out.append({
                'gameId': gid,
                'position': position,
                'opponent_role': position,
                'champion_name': p.get('championName') or 'Unknown',
                'opponent_champion': opponent_champ,
                'kills': kills,
                'deaths': deaths,
                'assists': assists,
                'kda': kda,
                'goldEarned': p.get('goldEarned'),
                'totalMinionsKilled': p.get('totalMinionsKilled') + p.get('neutralMinionsKilled'),
                'item0': items[0],
                'item1': items[1],
                'item2': items[2],
                'item3': items[3],
                'item4': items[4],
                'item5': items[5],
                'summoner1Id': summoner1,
                'summoner2Id': summoner2,
                'opponent_kills': opponent_kills,
                'opponent_deaths': opponent_deaths,
                'opponent_assists': opponent_assists,
                'opponent_kda': opponent_kda,
                'opponent_cs': opponent_cs,
                'opponent_gold': opponent_gold,
                'opponent_item0': opponent_items[0],
                'opponent_item1': opponent_items[1],
                'opponent_item2': opponent_items[2],
                'opponent_item3': opponent_items[3],
                'opponent_item4': opponent_items[4],
                'opponent_item5': opponent_items[5],
                'opponent_summoner1Id': opponent_summoner1,
                'opponent_summoner2Id': opponent_summoner2,
                'win': win,
                'gameEndTimestamp': game_timestamp,
                'gameDuration': game_duration,
                'gameMode': game_mode
            })
        
        return jsonify({
            'matches': out,
            'total': len(game_list),
            'offset': offset,
            'limit': limit
        })
    except Exception as e:
        logger.error(f"api_matches error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/available-roles')
def api_available_roles():
    """
    Get list of roles played by summoner.
    Query params:
      - puuid (required)
    """
    try:
        puuid = request.args.get('puuid', '').strip()
        if not puuid:
            return jsonify({'error': 'puuid required'}), 400

        parts = db.fetch_data('game_participants', filters={'puuid': puuid})
        parts = [p for p in parts if p.get('gameStatusProcess') != 'Avoid']
        
        roles = set()
        for p in parts:
            pos = (p.get('individualPosition') or '').upper()
            if pos in ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']:
                roles.add(pos)
        
        return jsonify({'roles': sorted(list(roles))})
    except Exception as e:
        logger.error(f"api_available_roles error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/database/delete', methods=['POST'])
def api_database_delete():
    """
    Delete all tables from database.
    """
    try:
        db.delete_tables()
        logger.info("Database tables deleted")
        return jsonify({'success': True, 'message': 'Database cleared'})
    except Exception as e:
        logger.error(f"api_database_delete error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/database/update', methods=['POST'])
def api_database_update():
    """
    Run main() from test.py to fetch and update matches.
    """
    try:
        # Import and run main from test.py
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from update import main
        
        logger.info("Starting database update...")
        main()
        logger.info("Database update completed")
        return jsonify({'success': True, 'message': 'Database updated successfully'})
    except Exception as e:
        logger.error(f"api_database_update error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/role-stats')
def api_role_stats():
    """
    Role performance stats (winrate per role).
    Query params:
      - puuid (required)
    """
    try:
        puuid = request.args.get('puuid', '').strip()
        if not puuid:
            return jsonify({'error': 'puuid required'}), 400

        # Filter out remakes and ARAM with gameStatusProcess field
        parts = db.fetch_data('game_participants', filters={'puuid': puuid, 'gameStatusProcess': 'Normal'})
        if not parts:
            return jsonify([])

        by_role = {}
        for p in parts:
            role = p.get('individualPosition') or 'UNKNOWN'
            entry = by_role.setdefault(role, {'matches': 0, 'wins': 0})
            entry['matches'] += 1

            gid = p.get('gameId')
            team_rows = db.fetch_data('game_team', filters={'gameId': gid, 'teamId': p.get('teamId')})
            if team_rows:
                w = team_rows[0].get('win')
                win_flag = str(w).lower() in ('true', 't', '1', 'yes', 'y', 'win') if w else False
                if win_flag:
                    entry['wins'] += 1

        out = []
        for role, v in by_role.items():
            matches = v['matches']
            wins = v['wins']
            winrate = (wins / max(1, matches)) * 100 if matches > 0 else 0.0
            out.append({
                'role': role,
                'matches': matches,
                'wins': wins,
                'winrate': round(winrate, 2)
            })
        
        out.sort(key=lambda x: x['matches'], reverse=True)
        return jsonify(out)
    except Exception as e:
        logger.error(f"api_role_stats error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/ping-stats')
def api_ping_stats():
    """
    Aggregated ping statistics.
    Query params:
      - puuid (required)
    """
    try:
        puuid = request.args.get('puuid', '').strip()
        if not puuid:
            return jsonify({'error': 'puuid required'}), 400

        parts = db.fetch_data('game_participants', filters={'puuid': puuid})
        if not parts:
            return jsonify({})

        ping_types = [
            'allInPings', 'assistMePings', 'basicPings', 'commandPings',
            'dangerPings', 'enemyMissingPings', 'enemyVisionPings',
            'getBackPings', 'holdPings', 'needVisionPings', 'onMyWayPings',
            'pushPings', 'retreatPings', 'visionClearedPings'
        ]

        totals = {}
        for ping_type in ping_types:
            totals[ping_type] = sum((p.get(ping_type) or 0) for p in parts)

        return jsonify(totals)
    except Exception as e:
        logger.error(f"api_ping_stats error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/health')
def api_health():
    try:
        tables = db.get_all_tables()
        return jsonify({'status': 'healthy', 'tables': tables})
    except Exception as e:
        return jsonify({'status': 'unhealthy', 'error': str(e)}), 500

@app.route('/api/opponent-elo-distribution')
def api_opponent_elo_distribution():
    """
    Get distribution of opponent ranks faced by a summoner.
    Query params:
      - puuid (required)
    """
    try:
        puuid = request.args.get('puuid', '').strip()
        gameMode = request.args.get('gameMode', 'all').lower()
        if not puuid:
            return jsonify({'error': 'puuid required'}), 400

        # Filter out remakes and ARAM with gameStatusProcess field
        parts = db.fetch_data('game_participants', filters={'puuid': puuid, 'gameStatusProcess': 'Normal'})
        opponent_ranks = []

        # Filter by game mode
        if gameMode != 'all':
            gameModeFull = {
                'normal': 'Normal Draft',
                'solo': 'Ranked Solo',
                'flex': 'Ranked Flex',
                'swiftplay': 'Swiftplay'
            }.get(gameMode, '')
            if gameModeFull:
                parts = [p for p in parts if p.get('gameMode') == gameModeFull]

        # For each game, get opponent at same position
        for p in parts:
            gid = p.get('gameId')
            position = p.get('individualPosition') or 'UNKNOWN'
            team_id = p.get('teamId')

            # Get opponent team
            opponent_team = 200 if team_id == 100 else 100

            # Fetch opponent at same position
            opponents = db.fetch_data('game_participants', filters={
                'gameId': gid,
                'teamId': opponent_team,
                'individualPosition': position
            })

            if opponents:
                opp = opponents[0]
                rank = opp.get('current_rank')
                if rank:
                    opponent_ranks.append({'rank': rank, 'gameMode': p.get('gameMode')})
        
        return jsonify({
            'opponents': opponent_ranks,
            'total': len(opponent_ranks)
        })
    except Exception as e:
        logger.error(f"api_opponent_elo_distribution error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/test-api-key', methods=['GET'])
def api_test_api_key():
    try:
        user_config = config.read_user_config()
        url_config = config.read_url_config()
        api_handler = APIHandler()
        if api_handler.test_api_connection(user_config, url_config):
            return jsonify({'message': 'API key is valid'})
        else:
            return jsonify({'error': 'API key is invalid'}), 400
    except Exception as e:
        logger.error(f"api_test_api_key error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/update-api-key', methods=['POST'])
def api_update_api_key():
    try:
        data = request.json
        new_key = data.get('api_key')
        if not new_key:
            return jsonify({'error': 'api_key required'}), 400
        config.update_user_config(api_key=new_key)
        return jsonify({'message': 'API key updated successfully'})
    except Exception as e:
        logger.error(f"api_update_api_key error: {e}")
        return jsonify({'error': str(e)}), 500
    
@app.route('/api/write-user-config', methods=['POST'])
def api_write_user_config():
    """
    Écrit le username, usertag et api_key dans le fichier de config via la fonction existante.
    """
    try:
        data = request.json
        summoner_name = data.get('summoner_name')
        summoner_tag = data.get('summoner_tag')
        api_key = data.get('api_key')

        if not summoner_name or not summoner_tag or not api_key:
            return jsonify({'error': 'Tous les champs sont requis'}), 400

        # Utilise ta fonction existante
        config.write_user_config(
            gameName=summoner_name,
            tagLine=summoner_tag,
            api_key=api_key
        )

        return jsonify({'message': 'Configuration enregistrée avec succès'})

    except Exception as e:
        logger.error(f"api_write_user_config error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/last-30-summary')
def api_last_30_summary():
    """
    Summary of last 30 games for a summoner.
    Query params:
      - puuid (required)
    """
    try:
        puuid = request.args.get('puuid', '').strip()
        if not puuid:
            return jsonify({'error': 'puuid required'}), 400

        parts = db.fetch_data('game_participants', filters={'puuid': puuid})
        parts = sorted(parts, key=lambda x: int(x.get('gameEndTimestamp') or 0), reverse=True)[:30]

        if not parts:
            return jsonify({'error': 'no matches found'}), 404

        avg_kills = sum(int(p.get('kills') or 0) for p in parts) / len(parts)
        avg_deaths = sum(int(p.get('deaths') or 0) for p in parts) / len(parts)
        avg_assists = sum(int(p.get('assists') or 0) for p in parts) / len(parts)
        avg_cs = sum(int(p.get('totalMinionsKilled') or 0) + int(p.get('neutralMinionsKilled') or 0) for p in parts) / len(parts)
        avg_cs_min = avg_cs / (sum(int(p.get('gameDuration') or 0) for p in parts) / len(parts) / 60)
        avg_gold = sum(int(p.get('goldEarned') or 0) for p in parts) / len(parts)
        avg_gold_min = avg_gold / (sum(int(p.get('gameDuration') or 0) for p in parts) / len(parts) / 60)
        avg_game_duration = sum(int(p.get('gameDuration') or 0) for p in parts) / len(parts)

        champions_played = {}
        opponents_faced = {}
        opp_avg_kills = 0
        opp_avg_deaths = 0
        opp_avg_assists = 0
        opp_avg_cs = 0
        opp_avg_cs_min = 0
        opp_avg_gold = 0
        opp_avg_gold_min = 0
        total_duration = sum(int(p.get('gameDuration') or 0) for p in parts) / len(parts)

        for p in parts:
            champ = p.get('championName')
            role = p.get('individualPosition').upper()
            champions_played[(champ, role)] = champions_played.get((champ, role), 0) + 1

            gid = p.get('gameId')
            position = p.get('individualPosition') or 'UNKNOWN'
            team_id = p.get('teamId')
            opponent_team = 200 if team_id == 100 else 100

            opponents = db.fetch_data('game_participants', filters={
                'gameId': gid,
                'teamId': opponent_team,
                'individualPosition': position
            })

            if opponents:
                opp = opponents[0]
                opp_champ = opp.get('championName')
                opp_role = opp.get('individualPosition').upper()
                opponents_faced[(opp_champ, opp_role)] = opponents_faced.get((opp_champ, opp_role), 0) + 1

                opp_avg_kills += int(opp.get('kills') or 0)
                opp_avg_deaths += int(opp.get('deaths') or 0)
                opp_avg_assists += int(opp.get('assists') or 0)
                opp_avg_cs += int(opp.get('totalMinionsKilled') or 0) + int(opp.get('neutralMinionsKilled') or 0)
                opp_avg_gold += int(opp.get('goldEarned') or 0)

        opp_avg_kills /= len(parts)
        opp_avg_deaths /= len(parts)
        opp_avg_assists /= len(parts)
        opp_avg_cs /= len(parts)
        opp_avg_cs_min = opp_avg_cs / (total_duration / 60)
        opp_avg_gold /= len(parts)
        opp_avg_gold_min = opp_avg_gold / (total_duration / 60)

        return jsonify({
            'avg_kills': round(avg_kills, 1),
            'avg_deaths': round(avg_deaths, 1),
            'avg_assists': round(avg_assists, 1),
            'avg_cs': round(avg_cs, 1),
            'avg_cs_min': round(avg_cs_min, 1),
            'avg_gold': round(avg_gold, 1),
            'avg_gold_min': round(avg_gold_min, 1),
            'avg_game_duration': round(avg_game_duration, 1),
            'champions_played': list(champions_played.keys()),
            'opponents_faced': list(opponents_faced.keys()),
            'opp_avg_kills': round(opp_avg_kills, 1),
            'opp_avg_deaths': round(opp_avg_deaths, 1),
            'opp_avg_assists': round(opp_avg_assists, 1),
            'opp_avg_cs': round(opp_avg_cs, 1),
            'opp_avg_cs_min': round(opp_avg_cs_min, 1),
            'opp_avg_gold': round(opp_avg_gold, 1),
            'opp_avg_gold_min': round(opp_avg_gold_min, 1)
        })
    except Exception as e:
        logger.error(f"api_last_30_summary error: {e}")
        return jsonify({'error': str(e)}), 500
    
@app.route('/api/matchup-stats')
def api_matchup_stats():
    """
    Statistics per matchup for a summoner.
    Query params:
      - puuid (required)
      - role (optional: all, TOP, JUNGLE, MIDDLE, BOTTOM, SUPPORT)
    """
    try:
        puuid = request.args.get('puuid', '').strip()
        role = request.args.get('role', 'all').upper()
        if not puuid:
            return jsonify({'error': 'puuid required'}), 400

        parts = db.fetch_data('game_participants', filters={'puuid': puuid, 'gameStatusProcess': 'Normal'})

        parts = sorted(parts, 
                          key=lambda x: int(x['gameEndTimestamp'] or 0), 
                          reverse=True)

        if role != 'ALL':
            parts = [p for p in parts if (p.get('individualPosition') or '').upper() == role]

        by_matchup = {}

        for p in parts:
            my_champ = p.get('championName') or 'Unknown'
            my_role = p.get('individualPosition').upper()
            gid = p.get('gameId')
            position = p.get('individualPosition') or 'UNKNOWN'
            team_id = p.get('teamId')

            opponent_team = 200 if team_id == 100 else 100

            opponents = db.fetch_data('game_participants', filters={
                'gameId': gid,
                'teamId': opponent_team,
                'individualPosition': position
            })

            if opponents:
                opp = opponents[0]
                opp_champ = opp.get('championName') or 'Unknown'
                opp_role = opp.get('individualPosition').upper()

                key = (my_champ, my_role, opp_champ, opp_role)

                entry = by_matchup.setdefault(key, {
                    'matches': 0,
                    'wins': 0,
                    'my_kills': 0,
                    'my_deaths': 0,
                    'my_assists': 0,
                    'my_cs': 0,
                    'my_gold': 0,
                    'opp_kills': 0,
                    'opp_deaths': 0,
                    'opp_assists': 0,
                    'opp_cs': 0,
                    'opp_gold': 0,
                    'duration': 0,
                    'recent_form': []
                })

                entry['matches'] += 1
                entry['my_kills'] += int(p.get('kills') or 0)
                entry['my_deaths'] += int(p.get('deaths') or 0)
                entry['my_assists'] += int(p.get('assists') or 0)
                entry['my_cs'] += int(p.get('totalMinionsKilled') or 0) + int(p.get('neutralMinionsKilled') or 0)
                entry['my_gold'] += int(p.get('goldEarned') or 0)

                entry['opp_kills'] += int(opp.get('kills') or 0)
                entry['opp_deaths'] += int(opp.get('deaths') or 0)
                entry['opp_assists'] += int(opp.get('assists') or 0)
                entry['opp_cs'] += int(opp.get('totalMinionsKilled') or 0) + int(opp.get('neutralMinionsKilled') or 0)
                entry['opp_gold'] += int(opp.get('goldEarned') or 0)

                entry['duration'] += int(p.get('gameDuration') or 0)

                team_rows = db.fetch_data('game_team', filters={'gameId': gid, 'teamId': team_id})
                win = False
                if team_rows:
                    w = team_rows[0].get('win')
                    win = str(w).lower() in ('true', 't', '1', 'yes', 'y', 'win')

                if win:
                    entry['wins'] += 1
                    entry['recent_form'].append('W')
                else:
                    entry['recent_form'].append('L')

        out = []
        for (my_champ, my_role, opp_champ, opp_role), v in by_matchup.items():
            matches = v['matches']
            wins = v['wins']
            avg_duration = v['duration'] / matches

            my_avg_kills = v['my_kills'] / matches
            my_avg_deaths = v['my_deaths'] / matches
            my_avg_assists = v['my_assists'] / matches
            my_avg_cs = v['my_cs'] / matches
            my_cs_min = my_avg_cs / (avg_duration / 60) if avg_duration > 0 else 0
            my_avg_gold = v['my_gold'] / matches
            my_gold_min = my_avg_gold / (avg_duration / 60) if avg_duration > 0 else 0

            opp_avg_kills = v['opp_kills'] / matches
            opp_avg_deaths = v['opp_deaths'] / matches
            opp_avg_assists = v['opp_assists'] / matches
            opp_avg_cs = v['opp_cs'] / matches
            opp_cs_min = opp_avg_cs / (avg_duration / 60) if avg_duration > 0 else 0
            opp_avg_gold = v['opp_gold'] / matches
            opp_gold_min = opp_avg_gold / (avg_duration / 60) if avg_duration > 0 else 0

            winrate = (wins / matches * 100) if matches > 0 else 0

            out.append({
                'my_champ': my_champ,
                'my_role': my_role,
                'opp_champ': opp_champ,
                'opp_role': opp_role,
                'matches': matches,
                'winrate': round(winrate, 1),
                'my_avg_kills': round(my_avg_kills, 1),
                'my_avg_deaths': round(my_avg_deaths, 1),
                'my_avg_assists': round(my_avg_assists, 1),
                'my_avg_cs': round(my_avg_cs, 1),
                'my_cs_min': round(my_cs_min, 1),
                'my_avg_gold': round(my_avg_gold, 1),
                'my_gold_min': round(my_gold_min, 1),
                'opp_avg_kills': round(opp_avg_kills, 1),
                'opp_avg_deaths': round(opp_avg_deaths, 1),
                'opp_avg_assists': round(opp_avg_assists, 1),
                'opp_avg_cs': round(opp_avg_cs, 1),
                'opp_cs_min': round(opp_cs_min, 1),
                'opp_avg_gold': round(opp_avg_gold, 1),
                'opp_gold_min': round(opp_gold_min, 1),
                'recent_form': v['recent_form'][:5]
            })

        out.sort(key=lambda x: x['matches'], reverse=True)
        return jsonify(out)
    except Exception as e:
        logger.error(f"api_matchup_stats error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/performance')
def api_performance():
    """
    Get performance stats against opponent ranks.
    Query params:
      - puuid (required)
      - gameMode (optional: all, normal, solo, flex, swiftplay)
    """
    try:
        puuid = request.args.get('puuid', '').strip()
        gameMode = request.args.get('gameMode', 'all').lower()
        if not puuid:
            return jsonify({'error': 'puuid required'}), 400

        parts = db.fetch_data('game_participants', filters={'puuid': puuid, 'gameStatusProcess': 'Normal'})

        # Filter by game mode
        if gameMode != 'all':
            gameModeFull = {
                'normal': 'Normal Draft',
                'solo': 'Ranked Solo',
                'flex': 'Ranked Flex',
                'swiftplay': 'Swift Play'
            }.get(gameMode, '')
            if gameModeFull:
                parts = [p for p in parts if p.get('gameMode') == gameModeFull]

        by_opp_rank = {}
        ranks = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER']
        roles = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'SUPPORT']

        for p in parts:
            gid = p.get('gameId')
            position = p.get('individualPosition') or 'UNKNOWN'
            team_id = p.get('teamId')

            opponent_team = 200 if team_id == 100 else 100

            opponents = db.fetch_data('game_participants', filters={
                'gameId': gid,
                'teamId': opponent_team,
                'individualPosition': position
            })

            if opponents:
                opp = opponents[0]
                opp_rank_str = opp.get('current_rank') or 'UNRANKED'
                parts_rank = opp_rank_str.split('_')
                opp_rank = parts_rank[0].upper() if parts_rank else 'UNRANKED'
                if opp_rank not in ranks:
                    continue  # Skip if not in defined ranks
                if opp_rank in ['GRANDMASTER', 'CHALLENGER']:
                    opp_rank = 'MASTER'

                role = position.upper()
                if role == 'UTILITY':
                    role = 'SUPPORT'
                if role not in roles:
                    continue

                if opp_rank not in by_opp_rank:
                    by_opp_rank[opp_rank] = {
                        'total_matches': 0,
                        'wins': 0,
                        'losses': 0,
                        'kills': 0,
                        'deaths': 0,
                        'assists': 0,
                        'cs': 0,
                        'gold': 0,
                        'duration': 0,
                        'by_role': {r: {'matches': 0, 'wins': 0, 'losses': 0, 'kills': 0, 'deaths': 0, 'assists': 0, 'cs': 0, 'gold': 0, 'duration': 0} for r in roles}
                    }

                rank_data = by_opp_rank[opp_rank]
                rank_data['total_matches'] += 1
                rank_data['kills'] += p.get('kills', 0)
                rank_data['deaths'] += p.get('deaths', 0)
                rank_data['assists'] += p.get('assists', 0)
                rank_data['cs'] += p.get('totalMinionsKilled', 0) + p.get('neutralMinionsKilled', 0)
                rank_data['gold'] += p.get('goldEarned', 0)
                rank_data['duration'] += (int(p.get('gameDuration') or 0))

                team_rows = db.fetch_data('game_team', filters={'gameId': gid, 'teamId': team_id})
                win = False
                if team_rows:
                    win_val = team_rows[0].get('win')
                    win = str(win_val).lower() in ('true', 't', '1', 'yes', 'y', 'win')

                if win:
                    rank_data['wins'] += 1
                else:
                    rank_data['losses'] += 1

                role_data = rank_data['by_role'][role]
                role_data['matches'] += 1
                role_data['kills'] += p.get('kills', 0)
                role_data['deaths'] += p.get('deaths', 0)
                role_data['assists'] += p.get('assists', 0)
                role_data['cs'] += p.get('totalMinionsKilled', 0) + p.get('neutralMinionsKilled', 0)
                role_data['gold'] += p.get('goldEarned', 0)
                role_data['duration'] += (int(p.get('gameDuration') or 0))
                if win:
                    role_data['wins'] += 1
                else:
                    role_data['losses'] += 1

        out = {'by_rank': {}}
        for rank in ranks:
            if rank in by_opp_rank:
                rank_data = by_opp_rank[rank]
                total = rank_data['total_matches']
                if total < 10:
                    continue
                avg_kills = round(rank_data['kills'] / total, 1) if total else 0
                avg_deaths = round(rank_data['deaths'] / total, 1) if total else 0
                avg_assists = round(rank_data['assists'] / total, 1) if total else 0
                kda = round((rank_data['kills'] + rank_data['assists']) / max(1, rank_data['deaths']), 1)
                avg_cs = round((rank_data['cs'] / total)) if total else 0
                avg_gold = round(rank_data['gold'] / total) if total else 0
                avg_duration = rank_data['duration'] / total if total else 0
                winrate = round((rank_data['wins'] / total * 100) if total else 0, 1)

                out_rank = {
                    'total_matches': total,
                    'wins': rank_data['wins'],
                    'losses': rank_data['losses'],
                    'winrate': winrate,
                    'avg_kills': avg_kills,
                    'avg_deaths': avg_deaths,
                    'avg_assists': avg_assists,
                    'kda': kda,
                    'avg_cs': avg_cs,
                    'avg_gold': avg_gold,
                    'avg_duration': avg_duration,
                    'by_role': {}
                }

                for role in roles:
                    r_data = rank_data['by_role'][role]
                    r_total = r_data['matches']
                    if r_total > 0:
                        r_avg_kills = round(r_data['kills'] / r_total, 1)
                        r_avg_deaths = round(r_data['deaths'] / r_total, 1)
                        r_avg_assists = round(r_data['assists'] / r_total, 1)
                        r_kda = round((r_data['kills'] + r_data['assists']) / max(1, r_data['deaths']), 1)
                        r_avg_cs = round((r_data['cs'] / r_total)) if r_total else 0
                        r_avg_duration = r_data['duration'] / r_total if r_total else 0
                        r_avg_gold = round(r_data['gold'] / r_total)
                        r_winrate = round((r_data['wins'] / r_total * 100), 1)

                        out_rank['by_role'][role] = {
                            'matches': r_total,
                            'wins': r_data['wins'],
                            'losses': r_data['losses'],
                            'winrate': r_winrate,
                            'avg_kills': r_avg_kills,
                            'avg_deaths': r_avg_deaths,
                            'avg_assists': r_avg_assists,
                            'kda': r_kda,
                            'avg_cs': r_avg_cs,
                            'avg_duration': r_avg_duration,
                            'avg_gold': r_avg_gold
                        }

                out['by_rank'][rank] = out_rank

        return jsonify(out)
    except Exception as e:
        logger.error(f"api_performance error: {e}")
        return jsonify({'error': str(e)}), 500
    
@app.route('/match-details')
def match_details():
    return render_template('match_details.html')

@app.route('/api/match-details')
def api_match_details():
    try:
        gameId = request.args.get('gameId')
        if not gameId:
            return jsonify({'error': 'gameId required'}), 400

        # Fetch teams stats
        teams = db.fetch_data('game_team', filters={'gameId': gameId})
        
        # Fetch participants
        participants = db.fetch_data('game_participants', filters={'gameId': gameId})
        
        # Map roles
        for p in participants:
            if p['individualPosition'] == 'UTILITY':
                p['individualPosition'] = 'SUPPORT'
            if p['individualPosition'] == 'BOTTOM':
                p['individualPosition'] = 'BOTTOM'  # ADC

        return jsonify({
            'teams': teams,
            'participants': participants
        })
        
    except Exception as e:
        logger.error(f"api_match_details error: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)