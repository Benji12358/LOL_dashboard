# -*- coding: utf-8 -*-
"""
Created on Sat May 25 12:15:17 2024

@author: benjamin_arrondeau (@arrondeb)
"""

from api_handler import APIHandler
from database import DatabaseManager
import logging
import pprint
from datetime import datetime
from config import Config
from tqdm import tqdm

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def estimate_time_to_fill_db(games):

    # There is 1 request per game fetched
    # There are, at maximum, 9 requests per game to get participants rank
    # ... so 10 x len(games) requests in total
    total_nb_requests = 10 * len(games)
    # There are a maximum of 100 requests every 2 minutes
    # 100 requetes every 2 minutes
    approx_time = (total_nb_requests / 100) * 2
    logger.info(f"=== Task 2: Approx. time to fill the database {approx_time} min. ===")


def main():
    # Initialisation de la configuration 
    config = Config()
    user_config = config.read_user_config()
    url_config = config.read_url_config()
    useful_data = config.read_useful_config()

    # Initialisation de l'API
    api = APIHandler()

    # Initialisation de la base de données
    db = DatabaseManager()
    db.create_tables()
    
    # Task 1: Fetch et save summoner
    logger.info("=== Step 1: Fetch and Save summoner ===")
    summoner_existence = db.fetch_main_summoner()
    
    if not summoner_existence:
        api.test_api_connection(user_config, url_config)
        account_puiid = api.fetch_puuid(user_config, url_config)
        account_rank = api.fetch_summoner_rank(user_config, url_config, account_puiid)
        
        summoner = {
            "summoner_name": user_config['gameName'],
            "summoner_tag": user_config['tagLine'],
            "puuid": account_puiid,
            "current_rank": account_rank
        }
        db.insert_summoner(summoner)
    else:
        summoner = db.fetch_data('summoner')[0]
        account_puiid = summoner['puuid']

    # Task 2: Fetch et save summoners games participants and teams
    logger.info("=== Task 2: Fetch and Process games participants ===")
    all_games_id = api.fetch_all_matches(url_config, user_config, summoner)
    games_id_not_stored_yet = db.remove_already_stored_games(all_games_id, account_puiid)

    if games_id_not_stored_yet == []:
        logger.info("No new games to process. Exiting.")
        # return
    else:
        logger.info(f"{len(games_id_not_stored_yet)} new games to process.")
        estimate_time_to_fill_db(games_id_not_stored_yet)
        
        for i in tqdm(range(len(games_id_not_stored_yet)), desc="Processing games", unit="game"):

            game_id = games_id_not_stored_yet[i]
            game_json = api.fetch_match(url_config, user_config, game_id)

            additional_info = {
                "game_id": game_id,
                "game_timestamp": game_json["info"]["gameEndTimestamp"],
                "game_duration": game_json["info"]["gameDuration"],
                "game_mode": game_json["info"]["queueId"],
                "remake_status": game_json["info"]["participants"][0]["gameEndedInEarlySurrender"]
            }

            participants = db.cure_participants_data(game_json["info"]["participants"], additional_info, summoner, user_config, url_config, useful_data, api)
            db.insert_participants(participants)

            team_blue = db.cure_team_data(game_json["info"], useful_data, 0)
            team_red = db.cure_team_data(game_json["info"], useful_data, 1)

            db.insert_team(team_blue)
            db.insert_team(team_red)

        logger.info(f"Inserted {len(all_games_id)} games")



    # Debug
    # games = [75, 81, 145, 16]
    # for game in games:
    #     game_json = get_match(all_games_id[game])["info"]
    #     print(all_games_id[game], game_json["gameMode"], game_json["queueId"])

    # print(p0["championName"], p0['riotIdGameName'], p0['kills'], p0['deaths'], p0['assists'])
    # print(p5["championName"], p5['riotIdGameName'], p5['kills'], p5['deaths'], p5['assists'])

    # # fetch participant rows for this puuid
    # parts = db.fetch_data('game_participants', filters={'puuid': puuid})
    # total_games = len({p['gameId'] for p in parts})
    # total_kills = sum((p.get('kills') or 0) for p in parts)
    # total_deaths = sum((p.get('deaths') or 0) for p in parts)
    # total_assists = sum((p.get('assists') or 0) for p in parts)

    # # compute wins by checking team table per game
    # wins = 0
    # losses = 0
    # for p in game_list[:limit]:
    #     gid = p.get('gameId').strip("EUW1_")
    #     kills = p.get('kills') or 0
    #     deaths = p.get('deaths') or 0
    #     assists = p.get('assists') or 0
    #     kda = round((kills + assists) / max(1, deaths), 2)
    #     position = p.get('individualPosition') or '—'
        
    #     # Get opponent champion at same position
    #     opponent_champ = '—'
    #     opponent_team = 200 if p.get('teamId') == 100 else 100
    #     opponents = db.fetch_data('game_participants', filters={
    #         'gameId': "EUW1_" + gid,
    #         'teamId': opponent_team,
    #         'individualPosition': position
    #     })
    #     if opponents:
    #         opponent_champ = opponents[0].get('championName') or '—'


    # opponents = db.fetch_data('game_participants', filters={'gameId': all_games_id[4]})
    # teams = db.fetch_data('game_team', filters={'gameId': all_games_id[4]})
    # # print(all_games_id[0])
    # pprint.pprint(opponents[0])
    # pprint.pprint(opponents[5])
    # pprint.pprint(teams[0])

    # parts = db.fetch_data('game_participants', columns={'gameId', 'gameMode'}, filters={'puuid': account_puiid, 'gameStatusProcess': 'Normal'})
    # print(parts)
    # print(len(parts))

    # print(all_games_id)

    # opponents = db.fetch_data('game_participants', filters={'gameId': all_games_id[15]})
    # teams = db.fetch_data('game_team', filters={'gameId': all_games_id[15].strip("EUW1_")})
    # # print(all_games_id[0])
    # for i in range(10):
    #     print(opponents[i]["championName"], opponents[i]["summoner1Id"], opponents[i]["summoner2Id"])
    # # pprint.pprint(teams[0])

    # opponents = db.fetch_data('game_participants', filters={'gameId': all_games_id[9]})
    # print(opponents[0]["championName"])
    # print(opponents[5]["championName"])
    # pprint.pprint(opponents[5])
    # print(opponents[0]["gameEndTimestamp"])
    # print(datetime.fromtimestamp(int(opponents[0]["gameEndTimestamp"])/1000))


    # winrate = (wins / max(1, (wins + losses))) * 100 if (wins + losses) > 0 else 0.0
    # kda = (total_kills + total_assists) / max(1, total_deaths)
    # avg_kda = kda / max(1, total_games) if total_games > 0 else kda

    # summoner_row = db.fetch_data('summoner', filters={'puuid': puuid})
    # summoner = summoner_row[0] if summoner_row else {'puuid': puuid}


    # participants = db.fetch_data('game_participants', filters={'gameId': all_games_id[0]})
    # for p in participants:
    #     kda = (p['kills'] + p['assists']) / max(p['deaths'], 1)
    #     print(f"{p['championName']}: KDA = {kda:.2f}")

    # participants = game_json["info"]["participants"]
    # top laners always 0 and 5

if __name__ == '__main__':
    main()
