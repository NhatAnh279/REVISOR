import os
from dataclasses import dataclass

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client, create_client

_bearer = HTTPBearer(auto_error=False)


@dataclass
class CurrentUser:
    id: str
    # Supabase client that carries the user's JWT, so Row Level Security applies.
    db: Client


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
) -> CurrentUser:
    if creds is None:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if not url or not key:
        raise HTTPException(status_code=500, detail="Supabase is not configured")

    db = create_client(url, key)
    try:
        user = db.auth.get_user(creds.credentials).user
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    db.postgrest.auth(creds.credentials)
    return CurrentUser(id=user.id, db=db)
