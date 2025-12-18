from configparser import ConfigParser

class Config:

    def __init__(self):
        self.config = ConfigParser()

    def write_config(self, gameName, tagLine, api_key):
        self.config['USERINFO'] = {
            'gameName': gameName,
            'tagLine': tagLine,
            'api_key': api_key
        }
        with open('config/config.ini', 'w') as configfile:
            self.config.write(configfile)

    def read_config(self):
        self.config.read('config/config.ini')
        return {
            'gameName': self.config.get('USERINFO', 'gameName'),
            'tagLine': self.config.get('USERINFO', 'tagLine'),
            'api_key': self.config.get('USERINFO', 'api_key')
        }
    
    def update_config(self, gameName=None, tagLine=None, api_key=None):
        self.config.read('config/config.ini')
        if gameName:
            self.config.set('USERINFO', 'gameName', gameName)
        if tagLine:
            self.config.set('USERINFO', 'tagLine', tagLine)
        if api_key:
            self.config.set('USERINFO', 'api_key', api_key)
        with open('config/config.ini', 'w') as configfile:
            self.config.write(configfile)