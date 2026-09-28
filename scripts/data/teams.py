"""Franchise definitions and nflverse team-code -> franchise mapping.

nflverse roster team codes are era-specific (e.g. HOU = Oilers 1960-96, Texans
2002+), so every code is resolved together with the season. Grouping follows
Pro Football Reference: the 1946-95 Browns are the Browns (Ravens start 1996),
AFL (1960-69) and AAFC (1946-49) seasons count toward the franchise that
continued into the NFL, and teams that folded map to None (defunct).
"""

# id: (city, nickname, abbreviation, primary color, secondary color, historical names)
FRANCHISES = {
    "ARI": ("Arizona", "Cardinals", "ARI", "#97233F", "#000000",
            ["Chicago Cardinals", "St. Louis Cardinals", "Phoenix Cardinals", "Racine Cardinals"]),
    "ATL": ("Atlanta", "Falcons", "ATL", "#A71930", "#000000", []),
    "BAL": ("Baltimore", "Ravens", "BAL", "#241773", "#9E7C0C", []),
    "BUF": ("Buffalo", "Bills", "BUF", "#00338D", "#C60C30", []),
    "CAR": ("Carolina", "Panthers", "CAR", "#0085CA", "#101820", []),
    "CHI": ("Chicago", "Bears", "CHI", "#0B162A", "#C83803", ["Decatur Staleys", "Chicago Staleys"]),
    "CIN": ("Cincinnati", "Bengals", "CIN", "#FB4F14", "#000000", []),
    "CLE": ("Cleveland", "Browns", "CLE", "#311D00", "#FF3C00", []),
    "DAL": ("Dallas", "Cowboys", "DAL", "#003594", "#869397", []),
    "DEN": ("Denver", "Broncos", "DEN", "#FB4F14", "#002244", []),
    "DET": ("Detroit", "Lions", "DET", "#0076B6", "#B0B7BC", ["Portsmouth Spartans"]),
    "GB": ("Green Bay", "Packers", "GB", "#203731", "#FFB612", []),
    "HOU": ("Houston", "Texans", "HOU", "#03202F", "#A71930", []),
    "IND": ("Indianapolis", "Colts", "IND", "#002C5F", "#A2AAAD", ["Baltimore Colts"]),
    "JAX": ("Jacksonville", "Jaguars", "JAX", "#006778", "#D7A22A", []),
    "KC": ("Kansas City", "Chiefs", "KC", "#E31837", "#FFB81C", ["Dallas Texans"]),
    "LV": ("Las Vegas", "Raiders", "LV", "#000000", "#A5ACAF", ["Oakland Raiders", "Los Angeles Raiders"]),
    "LAC": ("Los Angeles", "Chargers", "LAC", "#0080C6", "#FFC20E", ["San Diego Chargers"]),
    "LAR": ("Los Angeles", "Rams", "LAR", "#003594", "#FFA300", ["Cleveland Rams", "St. Louis Rams"]),
    "MIA": ("Miami", "Dolphins", "MIA", "#008E97", "#FC4C02", []),
    "MIN": ("Minnesota", "Vikings", "MIN", "#4F2683", "#FFC62F", []),
    "NE": ("New England", "Patriots", "NE", "#002244", "#C60C30", ["Boston Patriots"]),
    "NO": ("New Orleans", "Saints", "NO", "#D3BC8D", "#101820", []),
    "NYG": ("New York", "Giants", "NYG", "#0B2265", "#A71930", []),
    "NYJ": ("New York", "Jets", "NYJ", "#125740", "#FFFFFF", ["New York Titans"]),
    "PHI": ("Philadelphia", "Eagles", "PHI", "#004C54", "#A5ACAF", []),
    "PIT": ("Pittsburgh", "Steelers", "PIT", "#FFB612", "#101820", ["Pittsburgh Pirates"]),
    "SF": ("San Francisco", "49ers", "SF", "#AA0000", "#B3995D", []),
    "SEA": ("Seattle", "Seahawks", "SEA", "#002244", "#69BE28", []),
    "TB": ("Tampa Bay", "Buccaneers", "TB", "#D50A0A", "#34302B", []),
    "TEN": ("Tennessee", "Titans", "TEN", "#0C2340", "#4B92DB", ["Houston Oilers", "Tennessee Oilers"]),
    "WAS": ("Washington", "Commanders", "WAS", "#5A1414", "#FFB612",
            ["Washington Redskins", "Washington Football Team", "Boston Redskins", "Boston Braves"]),
}

# Each rule: (code, first season, last season, franchise ids or None, display name).
# A franchise list with two ids is a wartime merged team that counts for both.
Y = 9999
RULES = [
    ("AKR", 1920, 1926, None, "Akron Pros"),
    ("ARI", 1994, Y, ["ARI"], None), ("ARZ", 1994, Y, ["ARI"], None),
    ("PHO", 1988, 1993, ["ARI"], None), ("CHC", 1920, 1959, ["ARI"], None),
    ("STL", 1923, 1923, None, "St. Louis All-Stars"), ("STL", 1934, 1934, None, "St. Louis Gunners"),
    ("STL", 1960, 1987, ["ARI"], None), ("STL", 1995, 2015, ["LAR"], None),
    ("C-P", 1944, 1944, ["ARI", "PIT"], None), ("P-P", 1943, 1943, ["PHI", "PIT"], None),
    ("ATL", 1966, Y, ["ATL"], None),
    ("BAL", 1947, 1950, None, "Baltimore Colts (1947–50)"), ("BAL", 1953, 1983, ["IND"], None),
    ("BAL", 1996, Y, ["BAL"], None), ("BLT", 1996, Y, ["BAL"], None),
    ("BOS", 1929, 1929, None, "Boston Bulldogs"), ("BOS", 1932, 1936, ["WAS"], None),
    ("BOS", 1944, 1948, None, "Boston Yanks"), ("BOS", 1960, 1970, ["NE"], None),
    ("BRK", 1926, 1948, None, "Brooklyn Dodgers/Tigers"),
    ("BUF", 1920, 1929, None, "Buffalo All-Americans/Bisons"),
    ("BUF", 1946, 1949, None, "Buffalo Bills (AAFC)"), ("BUF", 1960, Y, ["BUF"], None),
    ("CAN", 1920, 1926, None, "Canton Bulldogs"), ("CAR", 1995, Y, ["CAR"], None),
    ("DEC", 1920, 1920, ["CHI"], None), ("CHS", 1921, 1921, ["CHI"], None),
    ("CHB", 1922, 1959, ["CHI"], None), ("CHI", 1960, Y, ["CHI"], None),
    ("CHH", 1949, 1949, None, "Chicago Hornets"), ("CHR", 1946, 1948, None, "Chicago Rockets"),
    ("CHR", 1960, 1960, ["LAC"], None),  # nflverse codes the 1960 L.A. Chargers as CHR
    ("CHT", 1920, 1920, None, "Chicago Tigers"),
    ("CIN", 1921, 1934, None, "Cincinnati Celts/Reds"), ("CIN", 1968, Y, ["CIN"], None),
    ("CLE", 1920, 1931, None, "Cleveland Tigers/Indians/Bulldogs"),
    ("CLE", 1937, 1945, ["LAR"], None), ("CLE", 1946, Y, ["CLE"], None), ("CLV", 1999, Y, ["CLE"], None),
    ("COL", 1920, 1926, None, "Columbus Panhandles/Tigers"),
    ("COW", 1960, 1962, ["DAL"], None), ("DAL", 1952, 1952, None, "Dallas Texans (1952)"),
    ("DAL", 1960, Y, ["DAL"], None),
    ("DAY", 1920, 1929, None, "Dayton Triangles"), ("DEN", 1960, Y, ["DEN"], None),
    ("DET", 1920, 1929, None, "Detroit Heralds/Tigers/Panthers/Wolverines"),
    ("POR", 1930, 1933, ["DET"], None), ("DET", 1934, Y, ["DET"], None),
    ("DON", 1946, 1949, None, "Los Angeles Dons"), ("DUL", 1923, 1927, None, "Duluth Kelleys/Eskimos"),
    ("ECG", 1921, 1922, None, "Evansville Crimson Giants"),
    ("FYJ", 1924, 1931, None, "Frankford Yellow Jackets"), ("GB", 1921, Y, ["GB"], None),
    ("HAM", 1920, 1926, None, "Hammond Pros"), ("HAR", 1926, 1926, None, "Hartford Blues"),
    ("HOU", 1960, 1996, ["TEN"], None), ("HOU", 2002, Y, ["HOU"], None), ("HST", 2002, Y, ["HOU"], None),
    ("TEN", 1997, Y, ["TEN"], None),
    ("IND", 1984, Y, ["IND"], None), ("JAX", 1995, Y, ["JAX"], None),
    ("KC", 1924, 1926, None, "Kansas City Blues/Cowboys"), ("TEX", 1960, 1962, ["KC"], None),
    ("KC", 1963, Y, ["KC"], None), ("KEN", 1924, 1924, None, "Kenosha Maroons"),
    ("LA", 1926, 1926, None, "Los Angeles Buccaneers"), ("LA", 1946, 1994, ["LAR"], None),
    ("LA", 2016, Y, ["LAR"], None), ("RAM", 1946, 1994, ["LAR"], None), ("SL", 1995, 2015, ["LAR"], None),
    ("LAC", 2017, Y, ["LAC"], None), ("SD", 1961, 2016, ["LAC"], None),
    ("LOU", 1921, 1926, None, "Louisville Brecks/Colonels"),
    ("OAK", 1960, 2019, ["LV"], None), ("RAI", 1982, 1994, ["LV"], None), ("LV", 2020, Y, ["LV"], None),
    ("MIA", 1946, 1946, None, "Miami Seahawks"), ("MIA", 1966, Y, ["MIA"], None),
    ("MIL", 1922, 1926, None, "Milwaukee Badgers"),
    ("MIN", 1921, 1930, None, "Minneapolis Marines/Red Jackets"), ("MIN", 1961, Y, ["MIN"], None),
    ("MUN", 1920, 1921, None, "Muncie Flyers"), ("NE", 1971, Y, ["NE"], None),
    ("NEW", 1930, 1930, None, "Newark Tornadoes"), ("NO", 1967, Y, ["NO"], None),
    ("NY", 1921, 1921, None, "New York Brickley Giants"), ("NY", 1925, Y, ["NYG"], None),
    ("NYG", 1925, Y, ["NYG"], None), ("NYB", 1949, 1949, None, "New York Bulldogs"),
    ("NYT", 1960, 1962, ["NYJ"], None), ("NYJ", 1963, Y, ["NYJ"], None),
    ("NYY", 1926, 1951, None, "New York Yankees/Yanks"),
    ("OOR", 1922, 1923, None, "Oorang Indians"), ("ORG", 1929, 1929, None, "Orange Tornadoes"),
    ("PHI", 1933, Y, ["PHI"], None), ("PIT", 1933, Y, ["PIT"], None),
    ("POT", 1925, 1928, None, "Pottsville Maroons"), ("PRO", 1925, 1931, None, "Providence Steam Roller"),
    ("RAC", 1922, 1926, None, "Racine Legion/Tornadoes"), ("RI", 1920, 1925, None, "Rock Island Independents"),
    ("ROC", 1920, 1925, None, "Rochester Jeffersons"), ("SEA", 1976, Y, ["SEA"], None),
    ("SF", 1946, Y, ["SF"], None), ("SI", 1929, 1932, None, "Staten Island Stapletons"),
    ("TB", 1976, Y, ["TB"], None), ("TOL", 1922, 1923, None, "Toledo Maroons"),
    ("TON", 1921, 1921, None, "Tonawanda Kardex"),
    ("WAS", 1921, 1921, None, "Washington Senators"), ("WAS", 1937, Y, ["WAS"], None),
]

_BY_CODE = {}
for _r in RULES:
    _BY_CODE.setdefault(_r[0], []).append(_r)


def resolve(code, season):
    """Return (franchise ids list, defunct display name, known) for a code in a season."""
    for c, lo, hi, ids, name in _BY_CODE.get(code, []):
        if lo <= season <= hi:
            return ids or [], name, True
    return [], None, False


def teams_json():
    out = []
    for fid, (city, nick, abbr, c1, c2, hist) in FRANCHISES.items():
        codes = sorted({f"{r[0]} ({r[1]}–{'present' if r[2] == Y else r[2]})"
                        for r in RULES if r[3] and fid in r[3]})
        aliases = sorted({f"{city} {nick}", nick, city, abbr, *hist})
        out.append({"id": fid, "city": city, "nickname": nick, "abbreviation": abbr,
                    "colors": {"primary": c1, "secondary": c2},
                    "historicalNames": hist, "aliases": aliases, "sourceCodes": codes})
    return out
