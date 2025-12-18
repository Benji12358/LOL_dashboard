# -*- coding: utf-8 -*-
"""
Created on Sat May 25 12:15:17 2024

@author: benjamin_arrondeau (@arrondeb)
"""

from api_handler import APIHandler
from database import DatabaseManager
import logging
import time
import requests
import sys
import json
import pprint
from datetime import datetime
from config import Config
from tqdm import tqdm

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

global user_config, useful_data

config = Config()
user_config = config.read_user_config()
useful_data = config.read_useful_config()

def test_api_connection(account_url):
    test_url = account_url
    params = {'api_key': user_config['api_key']}
    r = requests.get(test_url, params)
    if r.status_code == 200:
        logger.info("API connection successful")
    else:
        r = r.json()
        status = r["status"]["status_code"]
        message = r["status"]["message"]
        logger.error(f"API connection failed with status code {status} : {message}")
        sys.exit(1)


def make_request(url, params):
    r = requests.get(url, params)
    time.sleep(1.2)
    if r.status_code != 200:
        r = r.json()
        status = r["status"]["status_code"]
        message = r["status"]["message"]
        logger.error(f"API connection failed with status code {status} : {message}")
        time.sleep(1.2)
        make_request(url, params)
    else:
        return r.json()


def test_summoner_existence(db):
    summoner = db.fetch_data('summoner')
    if summoner == []:
        logger.info("No summoner found in database")
        return False
    else:
        logger.info("Summoner found in database")
        return True


def get_puuid(account_url):
    params = {'api_key': user_config['api_key']}
    r = make_request(account_url, params)

    return r["puuid"]


def get_all_matches(puuid):
    all_games = []

    matches_url = useful_data["match_base_url"] + "/by-puuid/" + puuid + "/ids"

    proceed = True
    start = 0
    while proceed:

        params = {'api_key': user_config['api_key'],
                  'start': start,
                  'count': 100}
        r = make_request(matches_url, params)

        proceed = (len(r) == 100)
        all_games.extend(r)
        start+=100

    return all_games


def remove_already_stored_games(db, all_games_id, puuid):
    gameStored = db.fetch_data('game_participants', columns=['gameId'], filters={'puuid': puuid})
    gameStored = [game['gameId'] for game in gameStored]
    gameNotStoredYet = [x for x in all_games_id if x not in gameStored]
    
    return gameNotStoredYet


def estimate_time_to_fill_db(games):

    # There is 1 request per game fetched
    # There are 9 requests per game to get participants rank
    # ... so 10 x len(games) requests in total
    total_nb_requests = 10 * len(games)
    # There are a maximum of 100 requests every 2 minutes
    # 100 requetes every 2 minutes
    approx_time = (total_nb_requests / 100) * 2
    logger.info(f"=== Task 2: Approx. time to fill the database {approx_time} min. ===")



def get_match(match_id):
    match_url = useful_data["match_base_url"] + "/" + match_id

    params = {'api_key': user_config['api_key']}
    r = make_request(match_url, params)

    return r


def cure_team_data(gameData, n):

    cured_team = {x: gameData[x] for x in useful_data["team_data"] if x in gameData}

    tmp = {x: gameData["teams"][n]["objectives"][x]["kills"] for x in useful_data["objectives_data"] if x in gameData["teams"][n]["objectives"]}

    cured_team.update(tmp)

    cured_team["teamId"] = gameData["teams"][n]["teamId"]
    cured_team["win"] = gameData["teams"][n]["win"]
    cured_team["gameId"] = "EUW1_" + str(cured_team["gameId"]) 
    if gameData["participants"][0]["gameEndedInEarlySurrender"]:
        cured_team["win"] = "Remake"

    return cured_team


def get_summoner_rank(db, puuid):

    # we look if the summoner is already in the database
    summoner = db.fetch_data('game_participants', columns=['current_rank'], filters={'puuid': puuid})

    # if not, we fetch the rank from the Riot API
    if summoner == []:
        
        summoner_url = useful_data["league_base_url"] + "/" + puuid
        params = {'api_key': user_config['api_key']}
        r = make_request(summoner_url, params)
        
        if len(r) > 0:
            for i in range(len(r)):
                queue = r[i]
                if queue["queueType"] == "RANKED_SOLO_5x5":
                    return queue["tier"] + "_" + queue["rank"]
        else:
            # default rank
            return "Unranked"

    # if yes, we return the rank stored in the database
    else:
        return summoner[0]["current_rank"]

    


def cure_participants_data(participants, additional_info, summoner, db):

    cured_participants = []

    for i in range(len(participants)):
        participant = participants[i]
        cured_participant = {x: participant[x] for x in useful_data["participant_data"] if x in participant}

        if cured_participant["puuid"] == summoner["puuid"]:
            participant_rank = summoner["current_rank"]
        else:
            participant_rank = get_summoner_rank(db, participant["puuid"])
        
        cured_participant["current_rank"] = participant_rank
        cured_participant["gameId"] = additional_info["game_id"]
        cured_participant["gameEndTimestamp"] = additional_info["game_timestamp"]
        cured_participant["gameDuration"] = additional_info["game_duration"]

        match additional_info["game_mode"]:
            case 400:
                cured_participant["gameMode"] = "normal"
            case 420:
                cured_participant["gameMode"] = "solo"
            case 440:
                cured_participant["gameMode"] = "flex"
            case 450:
                cured_participant["gameMode"] = "ARAM"
            case 480:
                cured_participant["gameMode"] = "swiftplay"
            case _:
                cured_participant["gameMode"] = "other"

        if additional_info["remake_status"] or cured_participant["gameMode"] == "ARAM":
            cured_participant["gameStatusProcess"] = "Avoid"
        else:
            cured_participant["gameStatusProcess"] = "Normal"

        cured_participants.append(cured_participant)

    return cured_participants


def main():
    # Initialiser le gestionnaire API
    # api = APIHandler('https://api.example.com')
    db = DatabaseManager()
    # db.delete_tables()
    db.create_tables()
    
    # Task 1: Fetch et save summoner
    logger.info("=== Step 1: Fetch and Save summoner ===")
    summoner_existence = test_summoner_existence(db)
    if not summoner_existence:
        account_url = useful_data["account_base_url"] + "/" + user_config['gameName'] + "/" + user_config['tagLine'] + "?api_key=" + user_config['api_key']
        test_api_connection(account_url)
        account_puiid = get_puuid(account_url)
        account_rank = get_summoner_rank(db, account_puiid)
        
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
    all_games_id = get_all_matches(account_puiid)
    games_id_not_stored_yet = remove_already_stored_games(db, all_games_id, summoner['puuid'])

    if games_id_not_stored_yet == []:
        logger.info("No new games to process. Exiting.")
        # return
    else:
        logger.info(f"{len(games_id_not_stored_yet)} new games to process.")

        estimate_time_to_fill_db(games_id_not_stored_yet)
        
        for i in tqdm(range(len(games_id_not_stored_yet)), desc="Processing games", unit="game"):

            game_id = games_id_not_stored_yet[i]
            game_json = get_match(game_id)

            additional_info = {
                "game_id": game_id,
                "game_timestamp": game_json["info"]["gameEndTimestamp"],
                "game_duration": game_json["info"]["gameDuration"],
                "game_mode": game_json["info"]["queueId"],
                "remake_status": game_json["info"]["participants"][0]["gameEndedInEarlySurrender"]
            }

            participants = cure_participants_data(game_json["info"]["participants"], additional_info, summoner, db)
            db.insert_participants(participants)

            team_blue = cure_team_data(game_json["info"], 0)
            team_red = cure_team_data(game_json["info"], 1)

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
