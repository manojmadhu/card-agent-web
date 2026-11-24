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
    for fid, fam in cards.FAMILIES.items():
        r = c.put(f"/v1/cards/{fid}", json=fam, headers=H)
        r.raise_for_status()
        print(f"card {fid}: {'created' if r.json()['created'] else 'updated'}")
        for v in fam["variants"]:
            files = [("images", (f"{v['id']}_{i}.png", d, "image/png"))
                     for i, d in enumerate(cards.reference_pngs(fid, v["id"], 3))]
            r = c.post(f"/v1/cards/{fid}/variants/{v['id']}/references", files=files,
                       params={"detect_card": "false"}, headers=H)
            print(f"  refs {fid}/{v['id']}: HTTP {r.status_code}, created {r.json().get('created')}")

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
