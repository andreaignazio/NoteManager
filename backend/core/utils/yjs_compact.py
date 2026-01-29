import sqlite3
import time
from typing import Iterable

import y_py as Y


def _apply_updates(rows: Iterable[bytes]) -> bytes:
    ydoc = Y.YDoc()
    for update in rows:
        if update:
            Y.apply_update(ydoc, update)
    return Y.encode_state_as_update(ydoc)


def compact_room(room_name: str, db_path: str) -> bool:
    conn = sqlite3.connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute("SELECT yupdate FROM yupdates WHERE path = ? ORDER BY timestamp", (room_name,))
        rows = cur.fetchall()
        if not rows:
            return False
        squashed = _apply_updates([r[0] for r in rows])
        cur.execute("DELETE FROM yupdates WHERE path = ?", (room_name,))
        cur.execute(
            "INSERT INTO yupdates VALUES (?, ?, ?, ?)",
            (room_name, sqlite3.Binary(squashed), b"", time.time()),
        )
        conn.commit()
        return True
    finally:
        conn.close()


def compact_all_rooms(db_path: str) -> int:
    conn = sqlite3.connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute("SELECT DISTINCT path FROM yupdates")
        rooms = [r[0] for r in cur.fetchall()]
    finally:
        conn.close()

    count = 0
    for room in rooms:
        if compact_room(room, db_path):
            count += 1
    return count
