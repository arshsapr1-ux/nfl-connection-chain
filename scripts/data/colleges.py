"""College name canonicalization.

Source strings are inconsistent across eras ("Miami (Fla.)" vs "Miami",
"California, Pa." vs "California (PA)"). Resolution order:
  1. MANUAL groups (exact variant -> canonical display name, plus search aliases)
  2. a generic key that ignores punctuation, "University", state-abbreviation style
"""
import html
import re

# canonical display name -> variants seen in the data and/or common search aliases
MANUAL = {
    "USC": ["Southern California", "Southern Cal", "So. California", "Southern Calif.", "Trojans"],
    "LSU": ["Louisiana State", "Louisiana State University"],
    "Ole Miss": ["Mississippi", "University of Mississippi"],
    "Miami (FL)": ["Miami", "Miami (Fla.)", "Miami (FL)", "Miami, Fla.", "Miami Florida", "The U"],
    "Miami (OH)": ["Miami (Ohio)", "Miami, O.", "Miami (OH)", "Miami of Ohio"],
    "BYU": ["Brigham Young"],
    "TCU": ["Texas Christian"],
    "SMU": ["Southern Methodist"],
    "UCF": ["Central Florida"],
    "NC State": ["North Carolina State", "N.C. State"],
    "UNLV": ["Nevada-Las Vegas"],
    "UTEP": ["Texas-El Paso"],
    "UTSA": ["Texas-San Antonio"],
    "UAB": ["Alabama-Birmingham"],
    "UConn": ["Connecticut"],
    "Pittsburgh": ["Pitt"],
    "Penn": ["Pennsylvania"],
    "Middle Tennessee": ["Middle Tennessee State", "MTSU"],
    "Bowling Green": ["Bowling Green State"],
    "Louisiana": ["Louisiana-Lafayette", "Southwestern Louisiana", "UL Lafayette"],
    "Louisiana-Monroe": ["Northeast Louisiana", "ULM"],
    "South Florida": ["University of South Florida", "USF"],
    "Florida International": ["FIU"],
    "Florida Atlantic": ["FAU"],
    "Cal Poly": ["Cal Poly (San Luis Obispo)", "Cal Poly-S.L.O."],
    "California": ["Cal", "Berkeley", "UC Berkeley"],
    "Southern Miss": ["Southern Mississippi"],
    "Northwestern State": ["Northwestern State (LA)", "Northwestern State, La.", "Northwestern State-Louisiana"],
    "VMI": ["Virginia Military Inst.", "Virginia Military Institute"],
    "Ohio": ["Ohio U.", "Ohio University"],
    "Texas A&M-Commerce": ["East Texas State", "East Texas A&M"],
    "Texas A&M-Kingsville": ["Texas A&I", "Texas A&M University-Kingsville"],
    "Southern": ["Southern U.", "Southern University"],
    "Minnesota State": ["Minn. State-Mankato", "Minnesota State-Mankato", "Mankato State"],
    "Southern Utah": ["Southern Utah State"],
    "Indiana (PA)": ["Indiana PA,  University of", "Indiana, Pa.", "IUP"],
    "Maryland-Eastern Shore": ["Maryland Univ. (Eastern Shore)"],
    "The Citadel": ["Citadel"],
    "Nevada": ["Nevada-Reno"],
    "Appalachian State": ["App State"],
    "Army": ["West Point"],
    "Houston Christian": ["Houston Baptist", "Houston Baptist University", "Houston Christian University"],
    "Colorado State-Pueblo": ["Colorado State (Pueblo)"],
    "Mississippi Valley State": ["Mississippi Valley State University"],
    "Towson": ["Towson State"],
    "Texas A&M": ["TAMU"],
    "Ohio State": ["tOSU"],
    "Penn State": ["PSU"],
    "Virginia Tech": ["VT"],
    "Georgia Tech": ["GT"],
}

NO_COLLEGE = {"no college", "none", "n/a", ""}

STATE_TOKENS = {
    "fla": "fl", "okla": "ok", "minn": "mn", "ill": "il", "ind": "in", "mont": "mt", "tenn": "tn",
    "colo": "co", "wis": "wi", "kan": "ks", "tex": "tx", "calif": "ca", "can": "canada", "st": "state",
    "univ": "university", "coll": "college", "comm": "community", "jc": "junior college",
    "cc": "community college", "ga": "ga", "ky": "ky",
}


def generic_key(s):
    s = s.lower().replace("&", " and ")
    s = re.sub(r"[.,'()\-/]", " ", s)
    toks = [STATE_TOKENS.get(t, t) for t in s.split()]
    s = " ".join(toks)
    s = re.sub(r"^(the|university of) ", "", s)
    s = re.sub(r" (university|u)$", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


_MANUAL_LOOKUP = {}
for _canon, _variants in MANUAL.items():
    for _v in [_canon, *_variants]:
        _k = generic_key(_v)
        if _MANUAL_LOOKUP.get(_k, _canon) != _canon:
            raise ValueError(f"alias {_v!r} collides: {_MANUAL_LOOKUP[_k]!r} vs {_canon!r}")
        _MANUAL_LOOKUP[_k] = _canon


def split_colleges(raw):
    """Split a raw 'A; B' field into cleaned names (unescape first: '&amp;' contains ';')."""
    raw = html.unescape(html.unescape(raw or ""))
    # a few rows are truncated to 'Texas A&amp' / 'William &amp' by upstream splitting
    return [p.strip() for p in raw.split(";") if p.strip().lower() not in NO_COLLEGE]


def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower().replace("&", "and")).strip("-")


class CollegeRegistry:
    """Collects raw names, groups them, and assigns canonical ids."""

    def __init__(self):
        self.groups = {}  # key -> {"canon": str|None, "variants": {name: count}}

    def key_for(self, name):
        k = generic_key(name)
        return ("m:" + _MANUAL_LOOKUP[k]) if k in _MANUAL_LOOKUP else ("g:" + k)

    def add(self, name):
        k = self.key_for(name)
        g = self.groups.setdefault(k, {"variants": {}})
        g["variants"][name] = g["variants"].get(name, 0) + 1
        return k

    def finalize(self):
        """Return (key -> college id, colleges.json list)."""
        key_to_id, out, used = {}, [], set()
        for k, g in self.groups.items():
            display = k[2:] if k.startswith("m:") else max(g["variants"], key=g["variants"].get)
            cid = slugify(display)
            while cid in used:
                cid += "-x"
            used.add(cid)
            key_to_id[k] = cid
            aliases = set(g["variants"]) | set(MANUAL.get(display, [])) | {display}
            out.append({"id": cid, "name": display, "aliases": sorted(aliases)})
        out.sort(key=lambda c: c["name"].lower())
        return key_to_id, out
