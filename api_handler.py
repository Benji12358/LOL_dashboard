import requests
import logging
import sys
import time
from database import DatabaseManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class APIHandler:
    """Gère la récupération des données de l'API"""
    
    def __init__(self):
        self.db = DatabaseManager()

    """ Try one request to the RIOT API to verify if the key has expired """
    def test_api_connection(self, user_config, url_config):
        account_url = url_config["account_base_url"] + "/" + user_config['gameName'] + "/" + user_config['tagLine'] + "?api_key=" + user_config['api_key']
        params = {'api_key': user_config['api_key']}
        r = requests.get(account_url, params)
        if r.status_code == 200:
            logger.info("API connection successful")
        else:
            r = r.json()
            status = r["status"]["status_code"]
            message = r["status"]["message"]
            logger.error(f"API connection failed with status code {status} : {message}")
            sys.exit(1)

    """ The RIOT API accept only 100 requests every 2 minutes.
     Thus, we need to make a request every 1.2 seconds.
     If a request fails, it is mostly due to "rate limit exceed". Thus, we wait and retry. """
    def make_request(self, url, params):
        r = requests.get(url, params)
        time.sleep(1.2)
        if r.status_code != 200:
            r = r.json()
            status = r["status"]["status_code"]
            message = r["status"]["message"]
            logger.error(f"API connection failed with status code {status} : {message}")
            time.sleep(1.2)
            self.make_request(url, params)
        else:
            return r.json()
        
    """ Fetch the puuid of the summoner for further requests """
    def fetch_puuid(self, user_config, url_config):
        account_url = url_config["account_base_url"] + "/" + user_config['gameName'] + "/" + user_config['tagLine'] + "?api_key=" + user_config['api_key']
        params = {'api_key': user_config['api_key']}
        r = self.make_request(account_url, params)

        return r["puuid"]
    
    """ Fetch all matches id for further requests """
    def fetch_all_matches(self, url_config, user_config, summoner):
        all_games = []

        matches_url = url_config["match_base_url"] + "/by-puuid/" + summoner["puuid"] + "/ids"

        proceed = True
        start = 0
        while proceed:

            params = {'api_key': user_config['api_key'],
                    'start': start,
                    'count': 100}
            r = self.make_request(matches_url, params)

            proceed = (len(r) == 100)
            all_games.extend(r)
            start+=100

        return all_games

    """ Fetch a match from its id """
    def fetch_match(self, url_config, user_config, match_id):
        match_url = url_config["match_base_url"] + "/" + match_id

        params = {'api_key': user_config['api_key']}
        r = self.make_request(match_url, params)

        return r
    
    """ Fetch summoner rank """
    def fetch_summoner_rank(self, url_config, user_config, puuid):
        
        summoner_url = url_config["league_base_url"] + "/" + puuid
        params = {'api_key': user_config['api_key']}
        r = self.make_request(summoner_url, params)
        
        if len(r) > 0:
            for i in range(len(r)):
                queue = r[i]
                if queue["queueType"] == "RANKED_SOLO_5x5":
                    return queue["tier"] + "_" + queue["rank"]
        else:
            # default rank
            return "Unranked"