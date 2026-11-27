#!/usr/bin/env python3
"""Reads the Blossom Hill staffing Google Calendar and saves upcoming shifts to data/staff.json.

Each staff member has their own Google Calendar. Their iCal addresses are kept together in
one GitHub secret named STAFF_CALENDAR_ICS, one address per line
(Google Calendar > Settings > the person's calendar > Integrate calendar >
"Secret address in iCal format"). The person's name comes from the calendar's name;
a leading "z" used for sorting (like "zAhmed") is dropped.
Uses only the Python standard library. Handles repeating shifts (daily/weekly/monthly).
"""
import json
import os
import re
import sys
import urllib.request
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

TZ = ZoneInfo("America/Chicago")
DAYS_BACK, DAYS_AHEAD = 1, 14
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "staff.json")
DAYS = {"MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6}


def unfold(text):
    return re.sub(r"\r?\n[ \t]", "", text).splitlines()


def parse_dt(value, params):
    """Returns (aware datetime, is_all_day)."""
    value = value.strip()
    if params.get("VALUE") == "DATE" or re.fullmatch(r"\d{8}", value):
        d = datetime.strptime(value[:8], "%Y%m%d")
        return d.replace(tzinfo=TZ), True
    if value.endswith("Z"):
        return datetime.strptime(value, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc).astimezone(TZ), False
    tz = ZoneInfo(params["TZID"]) if "TZID" in params else TZ
    return datetime.strptime(value, "%Y%m%dT%H%M%S").replace(tzinfo=tz).astimezone(TZ), False


def read_events(text):
    events, cur = [], None
    for line in unfold(text):
        if line == "BEGIN:VEVENT":
            cur = {"EXDATE": []}
        elif line == "END:VEVENT":
            if cur:
                events.append(cur)
            cur = None
        elif cur is not None and ":" in line:
            head, value = line.split(":", 1)
            name, *raw = head.split(";")
            params = dict(p.split("=", 1) for p in raw if "=" in p)
            if name in ("DTSTART", "DTEND", "RECURRENCE-ID"):
                cur[name], cur[name + "_ALLDAY"] = parse_dt(value, params)
            elif name == "EXDATE":
                cur["EXDATE"] += [parse_dt(v, params)[0] for v in value.split(",")]
            elif name in ("SUMMARY", "RRULE", "UID", "STATUS", "LOCATION", "DESCRIPTION"):
                cur[name] = value.replace("\\,", ",").replace("\\;", ";").replace("\\n", " ")
    return events


def occurrences(ev, first, last):
    """Start times of an event between two dates (inclusive), expanding RRULE."""
    start = ev["DTSTART"]
    if "RRULE" not in ev:
        return [start] if first <= start.date() <= last else []
    rule = dict(p.split("=", 1) for p in ev["RRULE"].split(";") if "=" in p)
    freq, interval = rule.get("FREQ", "DAILY"), int(rule.get("INTERVAL", "1"))
    count = int(rule["COUNT"]) if "COUNT" in rule else None
    until = parse_dt(rule["UNTIL"], {})[0] if "UNTIL" in rule else None
    byday = [DAYS[d[-2:]] for d in rule["BYDAY"].split(",")] if "BYDAY" in rule and freq == "WEEKLY" else [start.weekday()]
    week0 = start.date() - timedelta(days=start.date().weekday())
    out, n, d = [], 0, start.date()
    while d <= last:
        if freq == "DAILY":
            hit = (d - start.date()).days % interval == 0
        elif freq == "WEEKLY":
            hit = d.weekday() in byday and ((d - timedelta(days=d.weekday()) - week0).days // 7) % interval == 0
        elif freq == "MONTHLY":
            hit = d.day == start.day and ((d.year - start.year) * 12 + d.month - start.month) % interval == 0
        elif freq == "YEARLY":
            hit = (d.month, d.day) == (start.month, start.day) and (d.year - start.year) % interval == 0
        else:
            hit = False
        if hit:
            when = datetime.combine(d, start.timetz().replace(tzinfo=None), TZ)
            if until and when > until:
                break
            n += 1
            if d >= first and when not in ev["EXDATE"]:
                out.append(when)
            if count and n >= count:
                break
        d += timedelta(days=1)
    return out


def calendar_name(text):
    m = re.search(r"^X-WR-CALNAME:(.*)$", text, re.M)
    if not m:
        return ""
    name = m.group(1).strip().replace("\\,", ",")
    return re.sub(r"^z(?=[A-Z])", "", name)


def staff_name(summary):
    # "Barbara 8AM - 8PM 🌞" -> "Barbara"
    name = re.split(r"\s+\d{1,2}(:\d\d)?\s*[AaPp]?[Mm]?\b", summary or "", maxsplit=1)[0]
    name = re.sub(r"[^\w .'-]", "", name).strip(" -")
    return name or (summary or "").strip()


def main():
    urls = re.findall(r"https?://\S+", os.environ.get("STAFF_CALENDAR_ICS", ""))
    if not urls:
        print("STAFF_CALENDAR_ICS is not set; skipping staff schedule.")
        return
    events, failed = [], 0
    for url in urls:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "BlossomHillSchedule/1.0"})
            with urllib.request.urlopen(req, timeout=45) as r:
                text = r.read().decode("utf-8", "replace")
        except Exception as exc:
            failed += 1
            print(f"Could not read one calendar: {exc}", file=sys.stderr)
            continue
        who = calendar_name(text)
        for ev in read_events(text):
            ev["WHO"] = who
            events.append(ev)
        print(f"{who or 'calendar'}: read")
    if failed:
        print("A calendar could not be read; keeping the previous file so no one disappears.", file=sys.stderr)
        return

    today = datetime.now(TZ).date()
    first, last = today - timedelta(days=DAYS_BACK), today + timedelta(days=DAYS_AHEAD)

    # One-off changes to a repeating shift are separate entries with RECURRENCE-ID.
    moved = {(e.get("WHO"), e.get("UID"), e["RECURRENCE-ID"]) for e in events if "RECURRENCE-ID" in e}
    shifts = []
    for ev in events:
        if "DTSTART" not in ev or ev.get("STATUS") == "CANCELLED" or ev.get("DTSTART_ALLDAY"):
            continue
        length = (ev.get("DTEND") or ev["DTSTART"] + timedelta(hours=12)) - ev["DTSTART"]
        starts = [ev["DTSTART"]] if "RECURRENCE-ID" in ev else occurrences(ev, first, last)
        for s in starts:
            if "RECURRENCE-ID" not in ev and (ev.get("WHO"), ev.get("UID"), s) in moved:
                continue
            if not (first <= s.date() <= last):
                continue
            shifts.append({"name": ev.get("WHO") or staff_name(ev.get("SUMMARY")),
                           "start": s.strftime("%Y-%m-%dT%H:%M"),
                           "end": (s + length).strftime("%Y-%m-%dT%H:%M")})

    if not shifts:
        print("No shifts found; keeping the previous file.", file=sys.stderr)
        return
    shifts.sort(key=lambda x: (x["start"], x["name"]))
    try:
        with open(OUT, encoding="utf-8") as f:
            if json.load(f).get("shifts") == shifts:
                print("Schedule unchanged.")
                return
    except (OSError, ValueError):
        pass
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"updated": datetime.now(TZ).isoformat(timespec="minutes"), "shifts": shifts}, f, indent=1)
    print(f"Saved {len(shifts)} shifts to data/staff.json")


if __name__ == "__main__":
    main()
