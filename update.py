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
import json

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
    return approx_time


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
        account_rank = api.fetch_summoner_rank(url_config, user_config, account_puiid)
        
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

        with open('progress.json', 'w') as f:
            json.dump({'percent': 100, 'message': 'Update finished'}, f)
        
    else:
        logger.info(f"{len(games_id_not_stored_yet)} new games to process.")
        progress = {
            "percent": round((0 / len(games_id_not_stored_yet)) * 100, 1),
            "timeLeft": estimate_time_to_fill_db(games_id_not_stored_yet)
        }

        with open('progress.json', 'w') as f:
            json.dump(progress, f)
        
        for i in tqdm(range(len(games_id_not_stored_yet)), desc="Processing games", unit="game"):

            game_id = games_id_not_stored_yet[i]
            game_json = api.fetch_match(url_config, user_config, game_id)

            additional_info = {
                "game_id": game_id,
                "game_timestamp": game_json["info"]["gameEndTimestamp"],
                "game_duration": game_json["info"]["gameDuration"],
                "game_mode": game_json["info"]["queueId"],
                "remake_status": game_json["info"]["participants"][0]["gameEndedInEarlySurrender"],
                "game_version": game_json["info"]["gameVersion"]
            }

            participants = db.cure_participants_data(game_json["info"]["participants"], additional_info, summoner, user_config, url_config, useful_data, api)
            db.insert_participants(participants)

            team_blue = db.cure_team_data(game_json["info"], useful_data, 0)
            team_red = db.cure_team_data(game_json["info"], useful_data, 1)

            db.insert_team(team_blue)
            db.insert_team(team_red)

            progress = {
                "percent": round((i / len(games_id_not_stored_yet)) * 100, 1),
                "timeLeft": estimate_time_to_fill_db(games_id_not_stored_yet[i:])
            }

            with open('progress.json', 'w') as f:
                json.dump(progress, f)

        logger.info(f"Inserted {len(all_games_id)} games")
        with open('progress.json', 'w') as f:
            json.dump({'percent': 100, 'message': 'Update finished'}, f)

        logger.info("Mise à jour terminée avec succès")
        

if __name__ == '__main__':
    main()
