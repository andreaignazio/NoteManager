from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from django.db.models import Prefetch

from .models import Page, Block
from .serializers import (
    PageSerializer, 
    PageDetailSerializer, 
    BlockSerializer, 
    BlockCreateSerializer
)

class PageViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
       
        qs = Page.objects.filter(owner=self.request.user)

    
        if self.action == "retrieve":
            qs = qs.prefetch_related(
                Prefetch(
                    "blocks",  # Deve matchare related_name='blocks' nel model Block
                    queryset=Block.objects.order_by("parent_block_id", "position"),
                )
            )
            
       
        return qs.order_by('-created_at')

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return PageDetailSerializer
        return PageSerializer
    
    @action(detail=True, methods=["post"], url_path="blocks")
    def create_block(self, request, pk=None):
        page = self.get_object() # Carica la pagina e verifica che sia tua (grazie al queryset)

       
        serializer = BlockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        block = serializer.save(page=page)
        return Response(BlockSerializer(block).data, status=status.HTTP_201_CREATED)

class BlockViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Block.objects.filter(page__owner=self.request.user)

    def get_serializer_class(self):
        if self.action == "create":
            return BlockCreateSerializer
        return BlockSerializer

    def perform_create(self, serializer):
     
        page = serializer.validated_data["page"]

        if page.owner_id != self.request.user.id:
            raise PermissionDenied("Non puoi creare blocchi su una pagina non tua.")

        serializer.save()