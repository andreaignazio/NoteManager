from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    PageViewSet,
    TiptapDocumentViewSet,
    UserLookupViewSet,
    PageInviteViewSet,
    PageAuditLogViewSet,
)

router = DefaultRouter()
router.register(r"pages", PageViewSet, basename="pages")
router.register(r"tiptap-docs", TiptapDocumentViewSet, basename="tiptap-docs")
router.register(r"users", UserLookupViewSet, basename="users")
router.register(r"invites", PageInviteViewSet, basename="invites")
router.register(r"audit-logs", PageAuditLogViewSet, basename="audit-logs")

urlpatterns = [
    path("", include(router.urls)),
]