import os
import logging
from datetime import datetime
from sqlalchemy import (create_engine, Column, Integer, String, DateTime, inspect)
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.exc import SQLAlchemyError

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Database setup ---
class DatabaseManager:
    def __init__(self):
        # Use persistent database file in home directory
        db_path = os.path.expanduser('./.lol_dashboard/lol_data.db')
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self.engine = create_engine(f'sqlite:///{db_path}')
        self.Session = sessionmaker(bind=self.engine)
        logger.info(f"Database path: {db_path}")

    def create_tables(self):
        Base.metadata.create_all(self.engine)
        logger.info("Tables created/verified")

    def delete_tables(self):
        Base.metadata.drop_all(self.engine)
        logger.info("Tables deleted")

    def get_all_tables(self) -> list:
        """Return list of tables in the connected database."""
        try:
            inspector = inspect(self.engine)
            return inspector.get_table_names()
        except Exception as e:
            logger.error(f"get_all_tables error: {e}")
            return []

    def fetch_data(self, table_name: str, columns: list = None, filters: dict = None) -> list:
        """
        Generic fetch for any table with column selection.
        
        Args:
            table_name (str): Name of the table to query
            columns (list): List of column names to fetch. If None, fetches all columns
            filters (dict): Optional dict of column -> value for WHERE clause
        
        Returns:
            list: List of dicts where keys are column names
        
        Examples:
            # Fetch all columns from summoner table
            db.fetch_data('summoner')
            
            # Fetch specific columns
            db.fetch_data('summoner', columns=['summoner_name', 'puuid'])
            
            # Fetch with filter
            db.fetch_data('summoner', filters={'summoner_name': 'lolEnable'})
            
            # Fetch specific columns with filter
            db.fetch_data('game_participants', 
                          columns=['championName', 'kills', 'deaths', 'assists'],
                          filters={'gameId': 'EUW1_0001'})
        """
        session = self.Session()
        try:
            from sqlalchemy import text
            
            # Build SELECT clause with quoted column names
            if columns is None:
                select_clause = "*"
            else:
                select_clause = ", ".join([f'"{col}"' for col in columns])
            
            # Build base query
            query = f'SELECT {select_clause} FROM "{table_name}"'
            params = {}
            
            # Add WHERE clause if filters provided with quoted column names
            if filters:
                conditions = []
                for k, v in filters.items():
                    conditions.append(f'"{k}" = :{k}')
                    params[k] = v
                query += " WHERE " + " AND ".join(conditions)
            
            logger.info(f"Executing query: {query}")
            
            # Execute query
            result = session.execute(text(query), params)
            cols = result.keys()
            rows = [dict(zip(cols, row)) for row in result.fetchall()]
            
            logger.info(f"Fetched {len(rows)} rows from {table_name}")
            return rows
        except Exception as e:
            logger.error(f"fetch_data error for {table_name}: {e}")
            return []
        finally:
            session.close()

    def insert_summoner(self, data: dict) -> int:
        """
        data example:
        {"summoner_name": "lolEnable", "summoner_tag": "3999", "puuid": "abc123"}
        """
        session = self.Session()
        try:
            s = Summoner(**{k: v for k, v in data.items() if k in Summoner.__table__.columns.keys()})
            session.add(s)
            session.commit()
            return 1
        except SQLAlchemyError as e:
            session.rollback()
            logger.error(f"insert_summoner error: {e}")
            return 0
        finally:
            session.close()

    def insert_participants(self, rows: list) -> int:
        """
        rows: list of dicts where keys match column names in GameParticipant
        """
        if not isinstance(rows, list):
            rows = [rows]
        session = self.Session()
        inserted = 0
        valid_cols = set(GameParticipant.__table__.columns.keys())
        try:
            for r in rows:
                filtered = {k: v for k, v in r.items() if k in valid_cols}
                gp = GameParticipant(**filtered)
                session.add(gp)
                inserted += 1
            session.commit()
            return inserted
        except SQLAlchemyError as e:
            session.rollback()
            logger.error(f"insert_participants error: {e}")
            return 0
        finally:
            session.close()

    def insert_team(self, data: dict) -> int:
        """
        data example: dict with keys of GameTeam
        """
        session = self.Session()
        try:
            filtered = {k: v for k, v in data.items() if k in GameTeam.__table__.columns.keys()}
            gt = GameTeam(**filtered)
            session.add(gt)
            session.commit()
            return 1
        except SQLAlchemyError as e:
            session.rollback()
            logger.error(f"insert_team error: {e}")
            return 0
        finally:
            session.close()

    def fetch_summoners(self) -> list:
        session = self.Session()
        try:
            return [self._row_to_dict(r) for r in session.query(Summoner).all()]
        finally:
            session.close()

    def fetch_participants(self, gameId=None) -> list:
        session = self.Session()
        try:
            q = session.query(GameParticipant)
            if gameId is not None:
                q = q.filter(GameParticipant.gameId == str(gameId))
            return [self._row_to_dict(r) for r in q.all()]
        finally:
            session.close()

    def fetch_teams(self, gameId=None) -> list:
        session = self.Session()
        try:
            q = session.query(GameTeam)
            if gameId is not None:
                q = q.filter(GameTeam.gameId == str(gameId))
            return [self._row_to_dict(r) for r in q.all()]
        finally:
            session.close()

    def _row_to_dict(self, row):
        return {c.name: getattr(row, c.name) for c in row.__table__.columns}
    
    """ Fetch the main summoner from the db """
    def fetch_main_summoner(self):
        summoner = self.fetch_data('summoner')
        if summoner == []:
            logger.info("No summoner found in database")
            return False
        else:
            logger.info("Summoner found in database")
            return True
    
    """ Clean an array of games Id to remove those already stored in the db """
    def remove_already_stored_games(self, all_games_id, puuid):
        gameStored = self.fetch_data('game_participants', columns=['gameId'], filters={'puuid': puuid})
        gameStored = [game['gameId'] for game in gameStored]
        gameNotStoredYet = [x for x in all_games_id if x not in gameStored]
        
        return gameNotStoredYet
    
    """ Fetch the rank of the summoner in the db. Return [] if he does not exist """
    def fetch_summoner_rank(self, puuid):
        return self.fetch_data('game_participants', columns=['current_rank'], filters={'puuid': puuid})

# --- Models ---
Base = declarative_base()

class Summoner(Base):
    __tablename__ = 'summoner'
    id = Column(Integer, primary_key=True)
    summoner_name = Column(String(200), nullable=False, index=True)
    summoner_tag = Column(String(50), nullable=True)
    puuid = Column(String(200), nullable=False, unique=True)
    current_rank = Column(String(100))
    created_at = Column(DateTime, default=datetime.utcnow)

class GameParticipant(Base):
    __tablename__ = 'game_participants'
    id = Column(Integer, primary_key=True)
    gameId = Column(String(64), nullable=False, index=True)
    gameEndTimestamp = Column(String(64), nullable=False)
    gameDuration = Column(String(64), nullable=False)
    gameMode = Column(String(64))
    gameStatusProcess = Column(String(64))
    puuid = Column(String(200), nullable=False)
    championName = Column(String(100))
    champExperience = Column(Integer)
    champLevel = Column(Integer)
    individualPosition = Column(String(50))
    teamId = Column(Integer)
    deaths = Column(Integer)
    kills = Column(Integer)
    assists = Column(Integer)
    allInPings = Column(Integer)
    assistMePings = Column(Integer)
    basicPings = Column(Integer)
    commandPings = Column(Integer)
    dangerPings = Column(Integer)
    enemyMissingPings = Column(Integer)
    enemyVisionPings = Column(Integer)
    getBackPings = Column(Integer)
    holdPings = Column(Integer)
    needVisionPings = Column(Integer)
    onMyWayPings = Column(Integer)
    pushPings = Column(Integer)
    retreatPings = Column(Integer)
    visionClearedPings = Column(Integer)
    doubleKills = Column(Integer)
    tripleKills = Column(Integer)
    quadraKills = Column(Integer)
    pentaKills = Column(Integer)
    killingSprees = Column(Integer)
    largestKillingSpree = Column(Integer)
    largestMultiKill = Column(Integer)
    firstBloodAssist = Column(String(50))
    firstBloodKill = Column(String(50))
    magicDamageDealt = Column(Integer)
    magicDamageDealtToChampions = Column(Integer)
    magicDamageTaken = Column(Integer)
    physicalDamageDealt = Column(Integer)
    physicalDamageDealtToChampions = Column(Integer)
    physicalDamageTaken = Column(Integer)
    damageSelfMitigated = Column(Integer)
    trueDamageDealt = Column(Integer)
    trueDamageDealtToChampions = Column(Integer)
    trueDamageTaken = Column(Integer)
    damageDealtToObjectives = Column(Integer)
    baronKills = Column(Integer)
    dragonKills = Column(Integer)
    objectivesStolen = Column(Integer)
    objectivesStolenAssists = Column(Integer)
    detectorWardsPlaced = Column(Integer)
    wardsPlaced = Column(Integer)
    wardsKilled = Column(Integer)
    visionScore = Column(Integer)
    spell1Casts = Column(Integer)
    spell2Casts = Column(Integer)
    spell3Casts = Column(Integer)
    spell4Casts = Column(Integer)
    summoner1Casts = Column(Integer)
    summoner1Id = Column(Integer)
    summoner2Casts = Column(Integer)
    summoner2Id = Column(Integer)
    totalTimeSpentDead = Column(Integer)
    longestTimeSpentLiving = Column(Integer)
    goldEarned = Column(Integer)
    totalMinionsKilled = Column(Integer)
    totalAllyJungleMinionsKilled = Column(Integer)
    totalEnemyJungleMinionsKilled = Column(Integer)
    timeCCingOthers = Column(Integer)
    totalTimeCCDealt = Column(Integer)
    current_rank = Column(String(100))
    item0 = Column(Integer)
    item1 = Column(Integer)
    item2 = Column(Integer)
    item3 = Column(Integer)
    item4 = Column(Integer)
    item5 = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)

class GameTeam(Base):
    __tablename__ = 'game_team'
    id = Column(Integer, primary_key=True)
    gameId = Column(String(64), nullable=False, index=True)
    gameMode = Column(String(100))
    gameType = Column(String(100))
    gameVersion = Column(String(100))
    endOfGameResult = Column(String(100))
    atakhan = Column(Integer)
    baron = Column(Integer)
    champion = Column(Integer)
    dragon = Column(Integer)
    horde = Column(Integer)
    inhibitor = Column(Integer)
    riftHerald = Column(Integer)
    tower = Column(Integer)
    teamId = Column(Integer)
    win = Column(String(20))
    created_at = Column(DateTime, default=datetime.utcnow)

# If run directly, create tables
if __name__ == '__main__':
    DatabaseManager().create_tables()
    logger.info("database.py executed directly -> tables created")