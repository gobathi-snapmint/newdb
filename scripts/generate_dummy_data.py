"""Generate dummy co_data.csv, cr_data.csv and cj_data.csv in public/data/.

Run:  python3 scripts/generate_dummy_data.py
Replace the files in public/data/ with the real exports (same names, same columns)
whenever they are available - the dashboard reads whatever is there.
"""
import csv
import os
import random
from datetime import date, datetime, timedelta

random.seed(42)

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "data")
START = date(2026, 6, 1)
END = date(2026, 11, 22)

BASE_COLS = [
    "raw_campaign_name", "campaign_name", "campaign_id", "Sent", "Delivered", "clicks", "OrderSuccess",
    "Campaign_Start_Date", "Campaign_End_Date", "Month", "Year", "Week", "Campaign_Type", "Audience_Type",
    "Product_Segment", "Mode", "Gender", "Channel", "cost_per_comm", "cost_per_undelivered", "Cost",
    "gtv_click_attr", "revenue_click_attr", "Age_Group", "Location", "Segment_1", "Segment_2", "Segment_3",
    "Segment_4", "Variant", "cost_per_sent", "delivery_rate", "click_through_rate", "conversion_rate",
    "cost_per_order", "order_per_sent", "last_event_ts", "last_order_ts",
]
JOURNEY_COLS = BASE_COLS[:3] + ["journey_id", "journey_name"] + BASE_COLS[3:] + ["Journey_Type"]

# mode -> (channel code, cost/comm, cost/undelivered, delivery rate, CTR, relative CVR)
MODES = {
    "PNS": ("P0", 0.01, 0.0, 0.45, 0.009, 0.8),
    "PS": ("P1", 0.01, 0.0, 0.55, 0.014, 0.9),
    "S": ("S0", 0.08, 0.0, 0.92, 0.014, 1.0),
    "W": ("W0", 0.115, 0.0, 0.96, 0.045, 1.3),
    "E": ("E0", 0.02, 0.0, 0.97, 0.006, 0.7),
    "RCS": ("R0", 0.12, 0.0, 0.72, 0.022, 1.1),
}
AUDIENCES = {"RU": 0.06, "NU": 0.025, "AZ": 0.035, "IL": 0.045, "OU": 0.03}
PRODUCTS = {"MKP": 14000, "PLN": 22000, "CKO": 9000, "CLU": 16000, "TVL": 11000, "UTL": 4000, "VOU": 2500}
SEGMENTS = ["P3D", "C3M", "P3M", "SLT", "TLT", "ELC", "MOB", "FSH", "C3D", "APL", "KCH", "PEN"]


def iso_week(d):
    y, w, _ = d.isocalendar()
    return f"{y}{w:02d}"


def november_effect(d, mode):
    """Story baked into the dummy data so the delta views have something to explain:
    in November WhatsApp CTR drops and SMS volume and cost go up -> CPO rises."""
    if d.month != 11:
        return 1.0, 1.0
    if mode == "W":
        return 1.0, 0.72  # (volume multiplier, CTR multiplier)
    if mode == "S":
        return 1.6, 0.9
    return 1.0, 1.0


def make_row(d, camp_type, audience, product, mode, name, cid, volume, exp, variant):
    chan, cpc, cpu, dr, ctr, cvr_mult = MODES[mode]
    vol_mult, ctr_mult = november_effect(d, mode)
    sent = int(volume * vol_mult * random.uniform(0.6, 1.4))
    delivered = int(sent * min(0.995, dr * random.uniform(0.85, 1.1)))
    clicks = int(delivered * ctr * ctr_mult * random.uniform(0.6, 1.5))
    orders = int(clicks * AUDIENCES[audience] * cvr_mult * random.uniform(0.5, 1.6))
    orders = min(orders, clicks)
    cost = round(delivered * cpc + (sent - delivered) * cpu, 2)
    aov = PRODUCTS[product] * random.uniform(0.7, 1.3)
    gtv = round(orders * aov, 2)
    revenue = round(gtv * random.uniform(0.05, 0.09), 2)
    seg1 = random.choice(SEGMENTS)
    seg2 = "EXP" if exp else "Y00"
    ts = datetime(d.year, d.month, d.day, random.randint(8, 21), random.randint(0, 59))
    return {
        "raw_campaign_name": name, "campaign_name": name, "campaign_id": cid,
        "Sent": sent, "Delivered": delivered, "clicks": clicks, "OrderSuccess": orders,
        "Campaign_Start_Date": d.isoformat(), "Campaign_End_Date": d.isoformat(),
        "Month": d.strftime("%Y%m"), "Year": d.year, "Week": iso_week(d),
        "Campaign_Type": camp_type, "Audience_Type": audience, "Product_Segment": product, "Mode": mode,
        "Gender": random.choice(["A", "A", "A", "M", "F"]), "Channel": chan,
        "cost_per_comm": cpc, "cost_per_undelivered": cpu, "Cost": cost,
        "gtv_click_attr": gtv, "revenue_click_attr": revenue,
        "Age_Group": random.choice(["1590", "1825", "2535", "3550"]),
        "Location": random.choice(["IND", "IND", "IND", "MH", "KA", "DL"]),
        "Segment_1": seg1, "Segment_2": seg2, "Segment_3": "X00", "Segment_4": "W00", "Variant": variant,
        "cost_per_sent": round(cost / sent, 4) if sent else 0,
        "delivery_rate": round(delivered / sent, 4) if sent else 0,
        "click_through_rate": round(clicks / delivered, 4) if delivered else 0,
        "conversion_rate": round(orders / clicks, 4) if clicks else 0,
        "cost_per_order": round(cost / orders, 2) if orders else 0,
        "order_per_sent": round(orders / sent, 6) if sent else 0,
        "last_event_ts": (ts + timedelta(hours=random.randint(1, 30))).isoformat(sep=" "),
        "last_order_ts": (ts + timedelta(hours=random.randint(1, 48))).isoformat(sep=" ") if orders else "",
    }


def days():
    d = START
    while d <= END:
        yield d
        d += timedelta(days=1)


def campaign_name(d, ctype, aud, prod, seg1, exp, chan):
    return f"{d:%Y%m%d}_{ctype}{aud}{prod}_1590AIND_{seg1}-{'EXP' if exp else 'Y00'}-X00-W00_{chan}"


def gen_onetime():
    rows, n = [], 0
    mode_w = {"PNS": 10, "PS": 1, "S": 2, "W": 3, "E": 1, "RCS": 1}
    for d in days():
        for _ in range(random.randint(14, 26)):
            n += 1
            mode = random.choices(list(mode_w), list(mode_w.values()))[0]
            ctype = "CS" if random.random() < 0.12 else "CO"
            aud = random.choice(list(AUDIENCES))
            prod = random.choice(list(PRODUCTS))
            exp = random.random() < 0.08
            vol = 400000 if mode in ("PNS", "PS") else 60000
            name = campaign_name(d, ctype, aud, prod, random.choice(SEGMENTS), exp, MODES[mode][0])
            rows.append(make_row(d, ctype, aud, prod, mode, name, f"~co{n:05d}", vol, exp, "1" if exp else "0"))
    return rows


def gen_recurring():
    camps = []
    for i in range(70):
        mode = random.choices(["PNS", "S", "W", "E"], [8, 2, 2, 1])[0]
        camps.append({
            "id": f"~cr{i:04d}", "type": random.choice(["CR", "CR", "CT"]), "aud": random.choice(list(AUDIENCES)),
            "prod": random.choice(list(PRODUCTS)), "mode": mode, "exp": random.random() < 0.1,
            "start": START + timedelta(days=random.randint(0, 60)),
            "end": END - timedelta(days=random.randint(0, 50)) if random.random() < 0.4 else END,
            "seg1": random.choice(SEGMENTS),
        })
    rows = []
    for d in days():
        for c in camps:
            if not (c["start"] <= d <= c["end"]) or random.random() < 0.15:
                continue
            vol = 90000 if c["mode"] == "PNS" else 9000
            name = campaign_name(c["start"], c["type"], c["aud"], c["prod"], c["seg1"], c["exp"], MODES[c["mode"]][0])
            rows.append(make_row(d, c["type"], c["aud"], c["prod"], c["mode"], name, c["id"], vol, c["exp"], "0"))
    return rows


JOURNEYS = [
    ("Onboarding - New Users", "Onboarding", "NU", "MKP"),
    ("Cart Abandonment", "Cart Abandonment", "RU", "MKP"),
    ("Checkout Drop-off", "Checkout", "IL", "CKO"),
    ("KYC Incomplete Nudge", "Onboarding", "NU", "PLN"),
    ("Dormant Reactivation", "Re-engagement", "AZ", "MKP"),
    ("Repeat Purchase", "Retention", "RU", "CLU"),
    ("Travel Browse Abandon", "Browse Abandonment", "OU", "TVL"),
    ("EMI Due Reminder Upsell", "Retention", "RU", "PLN"),
    ("Voucher Expiry", "Re-engagement", "IL", "VOU"),
    ("Utility Bill Nudge", "Browse Abandonment", "AZ", "UTL"),
]


def gen_journey():
    nodes = []
    for j, (jname, jtype, aud, prod) in enumerate(JOURNEYS):
        jid = f"jr{j:03d}x"
        for k, mode in enumerate(random.sample(["PNS", "S", "W", "E", "RCS"], random.randint(2, 4))):
            nodes.append({"jid": jid, "jname": jname, "jtype": jtype, "aud": aud, "prod": prod, "mode": mode,
                          "cid": f"~cj{j:02d}{k}", "exp": random.random() < 0.1, "step": k + 1})
    rows = []
    for d in days():
        for nd in nodes:
            vol = 50000 if nd["mode"] == "PNS" else 6000
            name = f"{nd['jname']} | Step {nd['step']} | {nd['mode']}"
            r = make_row(d, "CJ", nd["aud"], nd["prod"], nd["mode"], name, nd["cid"], vol, nd["exp"], "0")
            r.update({"journey_id": nd["jid"], "journey_name": nd["jname"], "Journey_Type": nd["jtype"]})
            rows.append(r)
    return rows


def write(fname, cols, rows):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, fname)
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)
    print(f"{path}: {len(rows)} rows")


if __name__ == "__main__":
    write("co_data.csv", BASE_COLS, gen_onetime())
    write("cr_data.csv", BASE_COLS, gen_recurring())
    write("cj_data.csv", JOURNEY_COLS, gen_journey())
