#!/usr/bin/env python3
"""Collects upcoming activities near Blossom Hill and saves them to data/activities.json.

Runs once a day on GitHub (see .github/workflows/update-activities.yml).
Sources:
  - Washington County Library events (adults and all ages, nearby branches)
  - Washington County calendar (community events only, no government meetings)
Uses only the Python standard library.
"""
import html
import json
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

TZ = ZoneInfo("America/Chicago")
DAYS_AHEAD = 21
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "activities.json")
UA = "BlossomHillActivities/1.0 (+https://blossomhill.life)"

LIBRARY_URL = ("https://washcolib.libcal.com/ajax/calendar/list?c=10166&date=0000-00-00"
               "&perpage=48&page={page}&audience=1276,1280")
# Branches closest to Blossom Hill (Woodbury). Add or remove names to change the list.
NEAR_BRANCHES = ["Woodbury", "Oakdale", "Lake Elmo", "Cottage Grove"]
# Library events to leave off the TV (appointments, kids' programs, cancellations).
SKIP_TITLE = re.compile(r"tech help|technology help|canceled|cancelled|storytime|story time|homework|"
                        r"library closed|board meeting", re.I)
SKIP_CATEGORY = re.compile(r"homework|storytimes|library board|careers", re.I)

COUNTY_URL = "https://www.washingtoncountymn.gov/RSSFeed.aspx?ModID=58&CID=All-calendar.xml"
COUNTY_KEEP = re.compile(r"park|free|festival|fair|concert|music|walk|hike|nature|holiday|celebrat|"
                         r"market|parade|garden|art|movie|picnic|fishing|ski|snowshoe|lights|museum", re.I)
COUNTY_SKIP = re.compile(r"meeting|board|training|conference|hearing|commission|committee|closed|"
                         r"council|budget|election|law enforcement|corrections|consortium", re.I)


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=45) as r:
        return r.read().decode("utf-8", "replace")


def clean(text, limit=150):
    text = html.unescape(re.sub(r"<[^>]+>", " ", text or ""))
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > limit:
        text = text[:limit].rsplit(" ", 1)[0].rstrip(".,;:-") + "…"
    return text


def fmt_time(dt):
    return dt.strftime("%I:%M %p").lstrip("0")


def library_events(today, last_day):
    found, page = [], 1
    while page <= 10:
        data = json.loads(get(LIBRARY_URL.format(page=page)))
        results = data.get("results") or []
        found.extend(results)
        if not results or len(found) >= int(data.get("total_results", 0)):
            break
        page += 1

    events = []
    for e in found:
        campus = (e.get("campus") or "").strip()
        if e.get("online_event") or not any(b in campus for b in NEAR_BRANCHES):
            continue
        if SKIP_TITLE.search(e.get("title", "")) or SKIP_CATEGORY.search(e.get("categories", "")):
            continue
        start = datetime.strptime(e["startdt"], "%Y-%m-%d %H:%M:%S")
        end = datetime.strptime(e["enddt"], "%Y-%m-%d %H:%M:%S")
        if not (today <= start.date() <= last_day):
            continue
        m = re.match(r"^(.*?)\s*\((.*)\)$", campus)
        place, town = (m.group(1), m.group(2)) if m else (campus, campus.replace(" Library", ""))
        loc = (e.get("location") or "").strip()
        if "Service Center" in loc:
            place = "Cottage Grove Service Center"
        all_day = bool(e.get("all_day"))
        events.append({
            "title": clean(e.get("title"), 80),
            "date": start.strftime("%Y-%m-%d"),
            "start": "" if all_day else fmt_time(start),
            "end": "" if all_day else fmt_time(end),
            "allDay": all_day,
            "place": place,
            "town": town,
            "category": clean((e.get("categories") or "").split(",")[0], 40),
            "desc": clean(e.get("shortdesc") or e.get("description")),
            "source": "Washington County Library",
        })
    return events


def county_events(today, last_day):
    root = ET.fromstring(get(COUNTY_URL))
    events = []
    for item in root.iter("item"):
        fields = {}
        for child in item:
            fields[child.tag.split("}")[-1]] = (child.text or "").strip()
        title = fields.get("title", "")
        if COUNTY_SKIP.search(title) or not COUNTY_KEEP.search(title):
            continue
        first_date = (fields.get("EventDates") or "").split(" - ")[0].strip()
        try:
            day = datetime.strptime(first_date, "%B %d, %Y").date()
        except ValueError:
            continue
        if not (today <= day <= last_day):
            continue
        times = fields.get("EventTimes", "")
        parts = [p.strip() for p in times.split("-")]
        all_day = times.startswith("12:00 AM") and "11:59 PM" in times
        start = end = ""
        if not all_day and parts and parts[0]:
            try:
                start = fmt_time(datetime.strptime(parts[0], "%I:%M %p"))
                end = fmt_time(datetime.strptime(parts[1], "%I:%M %p")) if len(parts) > 1 else ""
            except ValueError:
                pass
        location = fields.get("Location", "")
        town = "Washington County"
        m = re.search(r"([A-Z][A-Za-z .]+), MN", location)
        if m:
            # Street and city run together in this feed ("...Avenue NorthLake Elmo"), so split them.
            chunks = re.split(r"(?<=[a-z.])(?=[A-Z])|(?<=\b[NSEW])(?=[A-Z][a-z])", m.group(1))
            town = chunks[-1].strip() if not re.search(r"\d", chunks[-1]) else town
        events.append({
            "title": clean(title, 80),
            "date": day.strftime("%Y-%m-%d"),
            "start": start, "end": end, "allDay": all_day or not start,
            "place": "Washington County Parks" if re.search(r"park", title, re.I) else "Washington County",
            "town": town,
            "category": "Community",
            "desc": "",
            "source": "Washington County",
        })
    return events


def main():
    now = datetime.now(TZ)
    today, last_day = now.date(), now.date() + timedelta(days=DAYS_AHEAD)
    events, problems = [], []
    for name, fn in (("library", library_events), ("county", county_events)):
        try:
            got = fn(today, last_day)
            print(f"{name}: {len(got)} events")
            events.extend(got)
        except Exception as exc:  # keep going if one source is down
            problems.append(f"{name}: {exc}")
            print(f"{name} failed: {exc}", file=sys.stderr)

    if not events:
        print("No events found; keeping the previous file.", file=sys.stderr)
        return

    seen, unique = set(), []
    for e in sorted(events, key=lambda x: (x["date"], not x["allDay"],
                                           datetime.strptime(x["start"] or "12:00 AM", "%I:%M %p"))):
        key = (e["date"], e["title"].lower(), e["start"], e["place"])
        if key not in seen:
            seen.add(key)
            unique.append(e)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"updated": now.isoformat(timespec="minutes"), "problems": problems,
                   "events": unique}, f, ensure_ascii=False, indent=1)
    print(f"Saved {len(unique)} events to data/activities.json")


if __name__ == "__main__":
    main()
