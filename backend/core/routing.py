from django.urls import re_path

from .consumers import YjsDocumentConsumer, CommentsConsumer

websocket_urlpatterns = [
    re_path(r"^ws/yjs/(?P<room>[^/]+)$", YjsDocumentConsumer.as_asgi()),
    re_path(r"^ws/comments/(?P<page_id>[^/]+)$", CommentsConsumer.as_asgi()),
]
