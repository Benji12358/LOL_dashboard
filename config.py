from configparser import ConfigParser

class Config:

    def __init__(self):
        self.config = ConfigParser()

    def write_user_config(self, gameName, tagLine, api_key):
        self.config['USERINFO'] = {
            'gameName': gameName,
            'tagLine': tagLine,
            'api_key': api_key
        }
        with open('config/config.ini', 'w') as configfile:
            self.config.write(configfile)

    def read_user_config(self):
        self.config.read('config/config.ini')
        return {
            'gameName': self.config.get('USERINFO', 'gameName'),
            'tagLine': self.config.get('USERINFO', 'tagLine'),
            'api_key': self.config.get('USERINFO', 'api_key')
        }
    
    def read_url_config(self):
        self.config.read('config/lol.ini')
        return {
            'account_base_url': self.config.get('RIOT_API_URLS', 'account_base_url'),
            'match_base_url': self.config.get('RIOT_API_URLS', 'match_base_url'),
            'league_base_url': self.config.get('RIOT_API_URLS', 'league_base_url')
        }
    
    def read_useful_config(self):
        self.config.read('config/lol.ini')
        return {
            'participant_data': self.config.get('USEFUL_DATA', 'participant_data').replace("\n","").split(','),
            'team_data': self.config.get('USEFUL_DATA', 'team_data').replace("\n","").split(','),
            'objectives_data': self.config.get('USEFUL_DATA', 'objectives_data').replace("\n","").split(',')
        }
    
    def update_user_config(self, gameName=None, tagLine=None, api_key=None):
        self.config.read('config/config.ini')
        if gameName:
            self.config.set('USERINFO', 'gameName', gameName)
        if tagLine:
            self.config.set('USERINFO', 'tagLine', tagLine)
        if api_key:
            self.config.set('USERINFO', 'api_key', api_key)
        with open('config/config.ini', 'w') as configfile:
            self.config.write(configfile)