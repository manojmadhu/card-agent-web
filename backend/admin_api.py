"""Registry admin endpoints for the Card Agent Console (API mode).

The card-agent MVP exposes:
    POST /v1/cards/validate     GET /v1/registry     POST /v1/registry/reload
The console additionally needs to read/write family YAML and upload reference images.
Mount this router on the existing FastAPI app:

    from admin_api import make_admin_router
    app.include_router(make_admin_router(Path("registry"), reload_fn=registry.reload))

It only touches files under the registry directory (registry/<family>.yaml and
registry/refs/<family>/<variant>/*), validates YAML before writing, keeps a .bak of the
previous version, and calls your existing hot-reload afterwards. Put it behind the same
internal gateway / RBAC as the review UI (ARCHITECTURE §6.5).
"""
from __future__ import annotations

import re
import shutil
import time
from pathlib import Path
from typing import Callable

import yaml
from fastapi import APIRouter, File, HTTPException, Request, UploadFile

ID_RE = re.compile(r"^[a-z0-9_-]+$")
REQUIRED = ("family", "family_name", "keywords", "variants")
MAX_IMAGE_BYTES = 8 * 1024 * 1024


def _check_family(doc: dict, family_id: str) -> None:
    missing = [k for k in REQUIRED if k not in doc]
    if missing:
        raise HTTPException(422, f"missing keys: {', '.join(missing)}")
    if doc["family"] != family_id:
        raise HTTPException(422, f"'family: {doc['family']}' does not match URL id '{family_id}'")
    if not doc.get("keywords"):
        raise HTTPException(422, "at least one keyword is required")
    ids = [v.get("id") for v in doc.get("variants", [])]
    if not ids or any(not isinstance(i, str) or not ID_RE.match(i) for i in ids) or len(set(ids)) != len(ids):
        raise HTTPException(422, "variants need unique lowercase ids")
    names = {f.get("name") for f in doc.get("fields", [])}
    for f in doc.get("fields", []):
        try:
            re.compile(f.get("regex", ""))
        except re.error as e:
            raise HTTPException(422, f"field {f.get('name')}: bad regex: {e}") from e
    for r in doc.get("rules", []):
        if r.get("field") not in names:
            raise HTTPException(422, f"rule {r.get('type')} references unknown field {r.get('field')}")
    w = doc.get("weights")
    if w and abs(sum(w.get(k, 0) for k in ("text", "visual", "colour")) - 1) > 0.011:
        raise HTTPException(422, "weights must sum to 1")


def make_admin_router(registry_dir: Path, reload_fn: Callable[[], object]) -> APIRouter:
    r = APIRouter(prefix="/v1/registry", tags=["registry-admin"])
    registry_dir = registry_dir.resolve()

    def fam_path(family_id: str) -> Path:
        if not ID_RE.match(family_id):
            raise HTTPException(400, "invalid family id")
        return registry_dir / f"{family_id}.yaml"

    @r.get("/families/{family_id}")
    def get_family(family_id: str):
        p = fam_path(family_id)
        if not p.exists():
            raise HTTPException(404, "family not found")
        return {"family": family_id, "yaml": p.read_text(encoding="utf-8")}

    @r.put("/families/{family_id}")
    async def put_family(family_id: str, request: Request):
        text = (await request.body()).decode("utf-8")
        try:
            doc = yaml.safe_load(text)
        except yaml.YAMLError as e:
            raise HTTPException(422, f"YAML parse error: {e}") from e
        if not isinstance(doc, dict):
            raise HTTPException(422, "YAML root must be a mapping")
        _check_family(doc, family_id)
        p = fam_path(family_id)
        if p.exists():
            shutil.copy2(p, p.with_suffix(f".yaml.{int(time.time())}.bak"))
        tmp = p.with_suffix(".yaml.tmp")
        tmp.write_text(text, encoding="utf-8")
        tmp.replace(p)  # atomic on POSIX
        reload_fn()
        return {"ok": True, "family": family_id}

    @r.delete("/families/{family_id}")
    def delete_family(family_id: str):
        p = fam_path(family_id)
        if not p.exists():
            raise HTTPException(404, "family not found")
        p.rename(p.with_suffix(f".yaml.{int(time.time())}.deleted"))
        reload_fn()
        return {"ok": True}

    @r.post("/families/{family_id}/refs/{variant_id}")
    async def upload_ref(family_id: str, variant_id: str, image: UploadFile = File(...)):
        fam_path(family_id)
        if not ID_RE.match(variant_id):
            raise HTTPException(400, "invalid variant id")
        data = await image.read()
        if len(data) > MAX_IMAGE_BYTES:
            raise HTTPException(413, "image too large")
        ext = ".png" if data[:8] == b"\x89PNG\r\n\x1a\n" else ".jpg" if data[:3] == b"\xff\xd8\xff" else None
        if not ext:
            raise HTTPException(415, "only PNG or JPEG")
        d = registry_dir / "refs" / family_id / variant_id
        d.mkdir(parents=True, exist_ok=True)
        out = d / f"ref_{int(time.time() * 1000)}{ext}"
        out.write_bytes(data)
        reload_fn()
        return {"ok": True, "path": str(out.relative_to(registry_dir))}

    return r
