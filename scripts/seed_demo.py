"""Seed a card-agent-enterprise server with demo data for the console.

Uses the backend's own synthetic test cards (tests/cards.py: two fictional programmes, ALPHA CLUB and
BETA REWARDS), so nothing real is uploaded. It creates the card families, uploads reference images,
writes sample photos to disk (to try "Validate" in the console), runs validations so the dashboard,
history and review queue have data, reviews a few runs, uploads an evaluation set and starts an
evaluation.

    python scripts/seed_demo.py --enterprise ../card-agent-enterprise \
        --api http://127.0.0.1:8080 --token "$CARDAGENT_API__ADMIN_TOKEN" --out samples/

Needs: numpy, opencv-python-headless, pillow, httpx (all in the backend's dev install).
Never point this at a production server.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import httpx


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--enterprise", required=True, help="path to a card-agent-enterprise checkout")
    ap.add_argument("--api", default="http://127.0.0.1:8080")
    ap.add_argument("--token", required=True, help="X-Admin-Token")
    ap.add_argument("--out", default="samples", help="folder for sample photos and the evaluation zip")
    ap.add_argument("--validations", type=int, default=24, help="how many validations to record")
    a = ap.parse_args()

    sys.path.insert(0, str(Path(a.enterprise).resolve()))
    from tests import cards  # noqa: E402  (the backend's synthetic card renderer)

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    H = {"X-Admin-Token": a.token}
    c = httpx.Client(base_url=a.api, timeout=120)

    # 1. card families + references --------------------------------------------------------------
    # Two-sided programmes (ae.gamma, qa.delta) exist only in backends with schema 2.1 test cards.
    two_sided = hasattr(cards, "side_reference_pngs")
    for fid, fam in cards.FAMILIES.items():
        r = c.put(f"/v1/cards/{fid}", json=fam, headers=H)
        r.raise_for_status()
        print(f"card {fid}: {'created' if r.json()['created'] else 'updated'}")
        sides = [s["id"] for s in fam.get("sides", [])] or [None]
        for v in fam["variants"]:
            for side in sides:
                pngs = cards.side_reference_pngs(fid, v["id"], side, 3) if side else cards.reference_pngs(fid, v["id"], 3)
                files = [("images", (f"{v['id']}_{side or 'front'}_{i}.png", d, "image/png")) for i, d in enumerate(pngs)]
                params = {"detect_card": "false", **({"side": side} if side else {})}
                r = c.post(f"/v1/cards/{fid}/variants/{v['id']}/references", files=files, params=params, headers=H)
                print(f"  refs {fid}/{v['id']}{'/' + side if side else ''}: HTTP {r.status_code}, created {r.json().get('created')}")

    # 2. sample photos ---------------------------------------------------------------------------
    import cv2  # noqa: E402
    samples = {
        "alpha_blue_ok.jpg": cards.photo(cards.render("ae.alpha", "blue", "FATIMA SAEED", "1048273391"), 1),
        "alpha_amber_ok.jpg": cards.photo(cards.render("ae.alpha", "amber", "OMAR KHALID", "2210457783"), 2),
        "beta_red_ok.jpg": cards.photo(cards.render("sa.beta", "red", "SARA MANSOOR", "7104455667"), 3),
        "alpha_blue_expired.jpg": cards.photo(cards.render("ae.alpha", "blue", "KHALID RASHID", "1877001299", "03/24"), 4),
        "alpha_amber_prefix_mismatch.jpg": cards.photo(cards.render("ae.alpha", "amber", "MARIAM YOUSEF", "1877001234"), 5),
        "blurry.jpg": cv2.GaussianBlur(cards.photo(cards.render("ae.alpha", "blue"), 6), (0, 0), 9),
    }
    for name, img in samples.items():
        (out / name).write_bytes(cards.jpg(img))
    (out / "not_a_card.jpg").write_bytes(cards.not_a_card(7))
    pairs = []  # (name, {field: bytes}) two-photo validations
    if two_sided:
        g_front = cards.side_photo("ae.gamma", "gold", "front", "4123456789", seed=11)
        g_back = cards.side_photo("ae.gamma", "gold", "back", "4123456789", seed=12)
        d_front = cards.side_photo("qa.delta", "standard", "front", "9123456780", seed=13)
        d_back = cards.side_photo("qa.delta", "standard", "back", "9123456780", seed=14)
        two = out / "two_sided"
        two.mkdir(exist_ok=True)
        for n, b in {"gamma_gold_front.jpg": g_front, "gamma_gold_back.jpg": g_back,
                     "delta_front.jpg": d_front, "delta_back.jpg": d_back}.items():
            (two / n).write_bytes(b)
        pairs = [("gamma front+back", {"front": g_front, "back": g_back}),
                 ("gamma swapped labels", {"front": g_back, "back": g_front}),
                 ("gamma front only", {"front": g_front}),
                 ("delta back only", {"back": d_back}),
                 ("delta sides detected", {"images": [d_front, d_back]})]
    print(f"sample photos -> {out}/")

    # 3. validations (history, stats, review queue) ----------------------------------------------
    files = sorted(out.glob("*.jpg"))
    run_ids = []
    for i in range(a.validations):
        f = files[i % len(files)]
        r = c.post("/v1/cards/validate", files={"image": (f.name, f.read_bytes(), "image/jpeg")},
                   data={"request_id": f"seed-{i:03d}"})
        r.raise_for_status()
        j = r.json()
        run_ids.append((f.name, j.get("run_id"), j["status"]))
    for label, parts in pairs:
        files = []
        for field, data in parts.items():
            for k, d in enumerate(data if isinstance(data, list) else [data]):
                files.append((field, (f"{field}{k}.jpg", d, "image/jpeg")))
        r = c.post("/v1/cards/validate", files=files, data={"request_id": f"seed-2s-{label.replace(' ', '-')}"})
        r.raise_for_status()
        j = r.json()
        run_ids.append((label, j.get("run_id"), j["status"]))
        print(f"  {label}: {j['status']} {j['reasons']}")
    print("validations:", {s: sum(1 for *_, x in run_ids if x == s) for s in ("ACCEPT", "REVIEW", "REJECT")})

    # 4. review some runs --------------------------------------------------------------------------
    reviewed = 0
    for name, rid, st in run_ids:
        if not rid or reviewed >= 4:
            continue
        if st == "ACCEPT" and "ok" in name:
            c.post(f"/v1/runs/{rid}/review", json={"decision": "accept", "reviewer": "seed", "note": "spot check"},
                   headers=H).raise_for_status()
            reviewed += 1
        elif st == "REJECT" and "not_a_card" in name:
            c.post(f"/v1/runs/{rid}/review", json={"decision": "reject", "reviewer": "seed"}, headers=H).raise_for_status()
            reviewed += 1
    print("reviews:", reviewed)

    # 5. evaluation set + evaluation -------------------------------------------------------------------
    cases = [
        ("a1.jpg", cards.jpg(samples["alpha_blue_ok.jpg"]), {"family": "ae.alpha", "variant": "blue", "expected_status": "ACCEPT",
                                                             "fields": {"card_number": "1048273391"}}),
        ("a2.jpg", cards.jpg(samples["alpha_amber_ok.jpg"]), {"family": "ae.alpha", "variant": "amber", "expected_status": "ACCEPT"}),
        ("b1.jpg", cards.jpg(samples["beta_red_ok.jpg"]), {"family": "sa.beta", "variant": "red", "expected_status": "ACCEPT"}),
        ("x1.jpg", cards.jpg(samples["alpha_blue_expired.jpg"]), {"family": "ae.alpha", "variant": "blue", "expected_status": "REJECT"}),
        ("n1.jpg", cards.not_a_card(9), {"family": None, "variant": None, "expected_status": "REJECT"}),
    ]
    z = cards.evaluation_zip(cases)
    if two_sided:  # add two-photo cases ("files") to the same set
        import io
        import zipfile
        zb = io.BytesIO()
        with zipfile.ZipFile(io.BytesIO(z)) as src, zipfile.ZipFile(zb, "w") as dst:
            manifest = json.loads(src.read("manifest.json"))
            for item in src.namelist():
                if item != "manifest.json":
                    dst.writestr(item, src.read(item))
            for n, b in {"g1f.jpg": g_front, "g1b.jpg": g_back, "d1b.jpg": d_back}.items():
                dst.writestr(f"photos/{n}", b)
            manifest += [
                {"files": {"front": "photos/g1f.jpg", "back": "photos/g1b.jpg"}, "family": "ae.gamma", "variant": "gold",
                 "expected_status": "ACCEPT", "fields": {"card_number": "4123456789"}},
                {"files": {"front": "photos/g1f.jpg"}, "family": "ae.gamma", "variant": "gold", "expected_status": "REJECT"},
                {"files": ["photos/d1b.jpg"], "family": "qa.delta", "variant": "standard", "expected_status": "ACCEPT"},
            ]
            dst.writestr("manifest.json", json.dumps(manifest, indent=1))
        z = zb.getvalue()
    (out / "evaluation_set.zip").write_bytes(z)
    r = c.post("/v1/evaluation-sets", files={"file": ("evaluation_set.zip", z, "application/zip")},
               data={"name": "Demo set (synthetic)"}, headers=H)
    r.raise_for_status()
    sid = r.json()["set_id"]
    r = c.post("/v1/evaluations", json={"set_id": sid}, headers=H)
    r.raise_for_status()
    print("evaluation started:", r.json()["evaluation_id"], "on set", sid)
    print(json.dumps(c.get("/v1/registry").json(), indent=1)[:400])


if __name__ == "__main__":
    main()
