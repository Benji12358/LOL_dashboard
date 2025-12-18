import requests
import logging
from database import DatabaseManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class APIHandler:
    """Gère la récupération et le nettoyage des données de l'API"""
    
    def __init__(self, api_url):
        self.api_url = api_url
        self.db = DatabaseManager()
    
    def fetch_from_api(self, endpoint):
        """Récupère les données de l'API"""
        try:
            url = f"{self.api_url}/{endpoint}"
            logger.info(f"Fetching data from {url}")
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching from API: {e}")
            return None
    
    def clean_data(self, raw_data):
        """Nettoie et normalise les données"""
        if isinstance(raw_data, list):
            return [self._clean_row(row) for row in raw_data]
        return self._clean_row(raw_data)
    
    def _clean_row(self, row):
        """Nettoie une ligne de données"""
        cleaned = {}
        for key, value in row.items():
            # Convertir les clés en minuscules et remplacer les espaces
            clean_key = key.lower().replace(' ', '_').replace('-', '_')
            
            # Nettoyer les valeurs
            if value is None:
                cleaned[clean_key] = None
            elif isinstance(value, str):
                cleaned[clean_key] = value.strip()
            elif isinstance(value, (int, float)):
                cleaned[clean_key] = value
            else:
                cleaned[clean_key] = value
        
        return cleaned
    
    def save_to_database(self, table_name, data):
        """Sauvegarde les données nettoyées dans la base de données"""
        cleaned_data = self.clean_data(data)
        return self.db.insert_data(table_name, cleaned_data)
    
    def fetch_and_save(self, api_endpoint, table_name):
        """Fetch, nettoie et sauvegarde en une seule opération"""
        logger.info(f"Fetching {api_endpoint} and saving to {table_name}")
        raw_data = self.fetch_from_api(api_endpoint)
        
        if raw_data:
            count = self.save_to_database(table_name, raw_data)
            logger.info(f"Successfully saved {count} records")
            return count
        return 0