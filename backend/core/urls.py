from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PageViewSet, BlockViewSet

router = DefaultRouter()
router.register(r"pages", PageViewSet, basename="pages")
router.register(r"blocks", BlockViewSet, basename="blocks")

urlpatterns = [
    path("", include(router.urls)),
]