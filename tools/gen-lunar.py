#!/usr/bin/env python3
# Lo-PDA: generate the lunar month and solar term tables in runtime/lunar.js.
# Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
#
# One-off generator, run by hand; not part of the build or the test suite. Needs PyEphem
# (pip install ephem; LGPL, used only here, nothing of it ships). PyEphem's libastro computes the
# Sun (VSOP87) and the Moon (ELP 2000-82) with Delta T applied.
#
# Rules (GB/T 33661-2017, the rules China has used since 1929; times in UTC+8 throughout):
#   - a month starts on the day (UTC+8) that holds the new moon;
#   - the month holding the winter solstice is month 11;
#   - when 13 months fall between two months 11, the first of them holding no major term
#     (zhongqi, solar longitude a multiple of 30 degrees) is a leap month, named after the month before it;
#   - solar terms are the days (UTC+8) on which the Sun's apparent longitude reaches 15k degrees.
# Before 1929 the official calendar used Beijing local time (UTC+7:46); the table, like the Hong Kong
# Observatory's, uses UTC+8 for every year.
#
#   python3 tools/gen-lunar.py            print the two JS tables
#   python3 tools/gen-lunar.py --json     months and terms as JSON (for cross-checks)
import json, math, sys
import ephem

TZ = 8 / 24.0                         # UTC+8 in days
DJD = 2415020.0                       # ephem.Date 0 = 1899-12-31 12:00 UT = JD 2415020

def bj_day(d):
    """ephem.Date (UT) -> integer days since 1970-01-01 of the UTC+8 calendar day"""
    jd = float(d) + DJD + TZ
    return math.floor(jd + 0.5) - 2440588

def ymd(n):
    import datetime
    return (datetime.date(1970, 1, 1) + datetime.timedelta(days=n))

def sun_lon(t):
    s = ephem.Sun(); s.compute(ephem.Date(t), epoch=ephem.Date(t))
    return math.degrees(float(ephem.Ecliptic(ephem.Equatorial(s.g_ra, s.g_dec, epoch=ephem.Date(t)), epoch=ephem.Date(t)).lon))

def term_time(deg, guess):
    """time (ephem.Date float) when the apparent solar longitude equals deg, near guess"""
    t = guess
    for _ in range(50):
        d = (deg - sun_lon(t) + 540) % 360 - 180
        if abs(d) < 1e-7: break
        t += d / 360 * 365.2422
    return t

def terms(y0, y1):
    """[(day, k)] for longitudes 15k from y0-01 to y1-12; k = 0 is the spring equinox"""
    out = []
    t = float(ephem.Date("%d/1/1" % y0)) - 20
    lon = sun_lon(t)
    k = int(lon // 15) + 1
    while True:
        deg = (k * 15) % 360
        guess = t + ((deg - sun_lon(t)) % 360) / 360 * 365.2422
        t = term_time(deg, guess)
        if ymd(bj_day(t)).year > y1: break
        out.append((bj_day(t), (k % 24)))
        k += 1; t += 10
    return out

def new_moons(y0, y1):
    out = []; d = ephem.Date("%d/1/1" % y0)
    while True:
        d = ephem.next_new_moon(d)
        if ymd(bj_day(d)).year > y1: break
        out.append(bj_day(d)); d = ephem.Date(d + 1)
    return out

def build():
    moons = new_moons(1897, 2102)
    tl = terms(1897, 2102)
    zq = [d for d, k in tl if k % 2 == 0]              # major terms: longitudes 0, 30, ... 330
    solstice = {ymd(d).year: d for d, k in tl if k == 18}   # 270 degrees
    def month_of(day):
        i = max(j for j, m in enumerate(moons) if m <= day); return i
    months = {}                                         # index of new moon -> (number, leap)
    for y in range(1897, 2102):
        a, b = month_of(solstice[y]), month_of(solstice[y + 1])
        leap_at = None
        if b - a == 13:
            for i in range(a + 1, b):
                if not any(moons[i] <= z < moons[i + 1] for z in zq):
                    leap_at = i; break
        num = 11
        for i in range(a, b):
            if i == leap_at: months[i] = (num, True); continue
            if i != a: num = num % 12 + 1
            months[i] = (num, False)
    # group into lunar years starting at month 1
    years = {}; cur = None
    for i in sorted(months):
        num, leap = months[i]
        if num == 1 and not leap:
            cur = ymd(moons[i]).year
            years[cur] = {"start": moons[i], "months": []}
        if cur is None or i + 1 >= len(moons): continue
        years[cur]["months"].append((num, leap, moons[i + 1] - moons[i]))
    return years, tl

def main():
    years, tl = build()
    first, last = 1899, 2100
    if "--json" in sys.argv:
        print(json.dumps({"years": {y: years[y] for y in range(first, last + 2)},
                          "terms": [(ymd(d).isoformat(), k) for d, k in tl if 1900 <= ymd(d).year <= 2100]}))
        return
    info = []
    for y in range(first, last + 1):
        ms = years[y]["months"]; bits = 0; leap = 0
        for i, (num, lp, n) in enumerate(ms):
            if n == 30: bits |= 1 << i
            if lp: leap = num
        assert len(ms) in (12, 13) and (leap > 0) == (len(ms) == 13)
        info.append("%05x" % (bits | leap << 13))
    # the first lunar year's new year, so the table needs no other anchor
    start = ymd(years[first]["start"]).isoformat()
    for y in range(first, last):
        assert years[y]["start"] + sum(n for _, _, n in years[y]["months"]) == years[y + 1]["start"]
    # solar terms by Gregorian year, from Minor Cold (k = 19, early January): the day of month minus 0 or 15
    rows = []
    for y in range(1900, last + 1):
        ds = [d for d, k in tl if ymd(d).year == y]
        assert len(ds) == 24
        row = ""
        for j, d in enumerate(ds):
            v = ymd(d).day - (15 if j % 2 else 0)
            assert 0 <= v <= 9 and ymd(d).month == j // 2 + 1, (y, j, ymd(d))
            row += str(v)
        rows.append(row)
    print("var START=\"%s\";" % start)
    print("var INFO=\"%s\";" % "".join(info))
    print("var TERMS=\"%s\";" % "".join(rows))

main()
