from rest_framework import viewsets, permissions
from django.db.models import Prefetch
from .models import Page, Block
from .serializers import PageSerializer, PageDetailSerializer

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
                    queryset=Block.objects.order_by("parent_block", "position"),
                )
            )
            
        # 3. Ordinamento delle pagine nella sidebar (es. le più recenti in alto)
        return qs.order_by('-updated_at')

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return PageDetailSerializer
        return PageSerializer

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

class BlockViewSet(viewsets.ModelViewSet):
    serializer_class = BlockSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self): 
        return Block.objects.filter(
            page__owner=self.request.user
        ).order_by('parent_block', 'position')

    def perform_create(self, serializer):
        # Security check extra: non puoi creare blocchi su pagine non tue
        page = serializer.validated_data['page']
        if page.owner != self.request.user:
            raise permissions.PermissionDenied("Non puoi modificare questa pagina.")
        serializer.save()

    # Opzionale: Endpoint custom per aggiornamenti batch (se serve in futuro)
    # @action(detail=False, methods=['patch'])
    # def batch_update(self, request): ...

