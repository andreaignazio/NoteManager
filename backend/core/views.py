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
        # 1. Base Query: Solo le pagine dell'utente
        qs = Page.objects.filter(owner=self.request.user)

        # 2. Optimization: Se sto chiedendo il dettaglio (retrieve),
        # scarico anche i blocchi in un colpo solo, ordinati correttamente.
        if self.action == "retrieve":
            qs = qs.prefetch_related(
                Prefetch(
                    "blocks",  # Deve matchare related_name='blocks' nel model Block
                    queryset=Block.objects.order_by("parent_block_id", "position"),
                )
            )
            
        # 3. Ordinamento delle pagine nella sidebar (es. le più recenti in alto)
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

        # Usiamo il serializer base dove 'page' è read-only.
        # Se l'utente mette "page": "altro_id" nel body, viene ignorato.
        serializer = BlockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Forziamo la pagina al salvataggio
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
        # qui validated_data['page'] ESISTE perché usiamo BlockCreateSerializer
        page = serializer.validated_data["page"]

        if page.owner_id != self.request.user.id:
            raise PermissionDenied("Non puoi creare blocchi su una pagina non tua.")

        serializer.save()