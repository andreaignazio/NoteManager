import asyncio
import logging
from urllib.parse import parse_qs

from asgiref.sync import sync_to_async
from django.conf import settings
import y_py as Y
from ypy_websocket.django_channels_consumer import YjsConsumer
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from ypy_websocket.ystore import SQLiteYStore
from ypy_websocket.yutils import sync, YMessageType, process_sync_message

logger = logging.getLogger("core.yjs")


class YjsSQLiteStore(SQLiteYStore):
    db_path = getattr(settings, "YJS_STORE_PATH", str(settings.BASE_DIR / "yjs.sqlite3"))
    document_ttl = getattr(settings, "YJS_DOCUMENT_TTL", 60 * 60 * 24 * 7)


class YjsPersistenceWorker:
    def __init__(self):
        self._queue: asyncio.Queue[tuple[str, str, bytes]] = asyncio.Queue()
        self._task: asyncio.Task | None = None
        self._stores: dict[str, SQLiteYStore] = {}

    def ensure_started(self):
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run())

    async def enqueue_update(self, room_name: str, update: bytes):
        await self._queue.put(("write", room_name, update))

    async def _get_store(self, room_name: str) -> SQLiteYStore:
        store = self._stores.get(room_name)
        if store:
            return store
        store = YjsSQLiteStore(room_name)
        await store.__aenter__()
        self._stores[room_name] = store
        return store

    async def _run(self):
        while True:
            kind, room_name, update = await self._queue.get()
            try:
                if kind == "write":
                    store = await self._get_store(room_name)
                    await store.write(update)
            except Exception:
                logger.exception("Yjs persistence worker error", extra={"room": room_name})


_yjs_worker = YjsPersistenceWorker()


@sync_to_async
def _get_user_from_token(token_key: str | None):
    if not token_key:
        return None
    token_key = token_key.strip()
    if token_key.lower().startswith("token "):
        token_key = token_key.split(" ", 1)[1].strip()
    try:
        from rest_framework.authtoken.models import Token
        token = Token.objects.select_related("user").get(key=token_key)
        return token.user
    except Token.DoesNotExist:
        return None


@sync_to_async
def _user_has_page_access(page_id: str, user) -> bool:
    if not user or not user.is_authenticated:
        return False
    from .models import Page, PageCollaborator
    if Page.objects.filter(pk=page_id, owner=user).exists():
        return True
    return PageCollaborator.objects.filter(page_id=page_id, user=user).exists()


class YjsDocumentConsumer(YjsConsumer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._raw_room = None
        self._closing = False

    def make_room_name(self) -> str:
        raw = self.scope["url_route"]["kwargs"]["room"]
        self._raw_room = raw
        safe = (
            raw.replace(":", "_")
            .replace("/", "_")
            .replace(" ", "_")
        )
        return safe[:95]

    async def make_ydoc(self) -> Y.YDoc:
        ydoc = Y.YDoc()
        raw_room = self._raw_room or self.scope["url_route"]["kwargs"]["room"]
        _yjs_worker.ensure_started()

        def _on_update(event):
            update = event.get_update()
            asyncio.create_task(_yjs_worker.enqueue_update(raw_room, update))

        ydoc.observe_after_transaction(_on_update)
        return ydoc

    async def connect(self):
        self._closing = False
        raw_room = self.scope["url_route"]["kwargs"]["room"]
        token_key = None
        try:
            raw_qs = self.scope.get("query_string", b"").decode("utf-8")
            token_key = parse_qs(raw_qs).get("token", [None])[0]
        except Exception:
            token_key = None

        logger.info(
            "WS connect attempt",
            extra={"room": raw_room, "token_present": bool(token_key)},
        )
       # logger.info("room:", raw_room)

        user = await _get_user_from_token(token_key)
        if not user:
            user = self.scope.get("user")

        if not user or not getattr(user, "is_authenticated", False):
            logger.warning(
                "WS auth failed", extra={"room": raw_room, "token_present": bool(token_key)}
            )
            await self.close(code=4001)
            return

        if raw_room.startswith("page:"):
            page_id = raw_room.split(":", 1)[1]
            allowed = await _user_has_page_access(page_id, user)
            if not allowed:
                logger.warning(
                    "WS access denied", extra={"room": raw_room, "user_id": str(user.id)}
                )
                await self.close(code=4003)
                return

        try:
            self.room_name = self.make_room_name()
            logger.info("WS make_ydoc start", extra={"room": raw_room})
            self.ydoc = await asyncio.wait_for(self.make_ydoc(), timeout=2.0)
            logger.info("WS make_ydoc done", extra={"room": raw_room})
            self._websocket_shim = self._make_websocket_shim(self.scope["path"])

            logger.info("WS group_add start", extra={"room": raw_room})
            await asyncio.wait_for(
                self.channel_layer.group_add(self.room_name, self.channel_name),
                timeout=1.0,
            )
            logger.info("WS group_add done", extra={"room": raw_room})

            await self.accept()
            logger.info("WS accepted", extra={"room": raw_room, "user_id": str(user.id)})

            await asyncio.wait_for(sync(self.ydoc, self._websocket_shim, logger), timeout=1.0)
            logger.info("WS synced", extra={"room": raw_room})
        except asyncio.TimeoutError:
            logger.warning("WS connect timeout", extra={"room": raw_room})
            await self.close(code=1011)
            return
        except Exception:
            logger.exception("WS connect error", extra={"room": raw_room})
            await self.close(code=1011)
            return

    async def disconnect(self, code):
        self._closing = True
        raw_room = self._raw_room or self.scope["url_route"]["kwargs"]["room"]
        logger.info("WS disconnect", extra={"room": raw_room, "code": code})
        await super().disconnect(code)
        self.ydoc = None

    async def receive(self, text_data=None, bytes_data=None):
        if self._closing or bytes_data is None or self.ydoc is None:
            return
        if not self._websocket_shim:
            return
        try:
            await self.group_send_message(bytes_data)
            if bytes_data[0] != YMessageType.SYNC:
                return
            await process_sync_message(
                bytes_data[1:], self.ydoc, self._websocket_shim, logger
            )
        except RuntimeError:
            raw_room = self._raw_room or self.scope["url_route"]["kwargs"]["room"]
            logger.warning("WS receive ignored (ydoc closed)", extra={"room": raw_room})


class CommentsConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        page_id = self.scope["url_route"]["kwargs"].get("page_id")
        token_key = None
        try:
            raw_qs = self.scope.get("query_string", b"").decode("utf-8")
            token_key = parse_qs(raw_qs).get("token", [None])[0]
        except Exception:
            token_key = None

        user = await _get_user_from_token(token_key)
        if not user:
            user = self.scope.get("user")

        if not user or not getattr(user, "is_authenticated", False):
            await self.close(code=4001)
            return

        allowed = await _user_has_page_access(page_id, user)
        if not allowed:
            await self.close(code=4003)
            return

        self.page_id = str(page_id)
        self.group_name = f"comments_page_{self.page_id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        group = getattr(self, "group_name", None)
        if group:
            await self.channel_layer.group_discard(group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        return

    async def comments_event(self, event):
        payload = event.get("payload")
        if payload is not None:
            await self.send_json(payload)
