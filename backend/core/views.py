from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from django.db.models import Prefetch
from rest_framework.exceptions import ValidationError
from .serializers import TransferSubtreeSerializer, DuplicatePageDeepSerializer, PageSerializer,  DuplicateBlockSubtreeSerializer
from django.db import transaction, IntegrityError
from fractional_indexing import generate_key_between
import uuid

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

       
        serializer = BlockCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        parent = serializer.validated_data.get("parent_block")

        if parent and parent.page_id != page.id:
            raise ValidationError({
                "parent_block": "parent_block must belong to the same page"
            })
        
        block = serializer.save(page=page)
        return Response(BlockSerializer(block).data, status=status.HTTP_201_CREATED)
    
    @action(detail=True, methods=["post"], url_path="transfer-subtree")
    def transfer_subtree(self, request, pk=None):
        """
        POST /pages/<from_page_uuid>/transfer-subtree/
        Body:
          {
            "root_id": "<block_uuid>",
            "to_page_id": "<page_uuid>",
            "to_parent_block": "<block_uuid|null>",
            "after_block_id": "<block_uuid|null>"
          }
        """
        from_page = self.get_object()  # garantisce ownership
        ser = TransferSubtreeSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data

        root_id = data["root_id"]
        to_page_id = data["to_page_id"]
        to_parent_block_id = data.get("to_parent_block")
        after_block_id = data.get("after_block_id")

        # carica target page (ownership)
        try:
            to_page = Page.objects.get(id=to_page_id, owner=request.user)
        except Page.DoesNotExist:
            raise ValidationError({"to_page_id": "Target page not found (or not owned by user)."})

        with transaction.atomic():
            # lock root (e valida che stia nella from_page)
            try:
                root = Block.objects.select_for_update().get(id=root_id, page=from_page)
            except Block.DoesNotExist:
                raise ValidationError({"root_id": "Root block not found in source page."})

            # valida to_parent_block (se presente) appartiene a to_page
            target_parent = None
            if to_parent_block_id is not None:
                try:
                    target_parent = Block.objects.select_for_update().get(id=to_parent_block_id, page=to_page)
                except Block.DoesNotExist:
                    raise ValidationError({"to_parent_block": "Target parent must belong to target page."})

            # ---- costruisci subtree ids (DFS) leggendo tutti i blocchi della from_page
            rows = list(
                Block.objects
                .select_for_update()
                .filter(page=from_page)
                .values_list("id", "parent_block_id")
            )

            children = {}
            for bid, pid in rows:
                children.setdefault(pid, []).append(bid)

            subtree_ids = []
            stack = [root.id]
            seen = set()
            while stack:
                cur = stack.pop()
                if cur in seen:
                    continue
                seen.add(cur)
                subtree_ids.append(cur)
                for ch in children.get(cur, []):
                    stack.append(ch)

            if after_block_id is not None and after_block_id in seen:
                raise ValidationError({
                    "after_block_id": "Cannot insert relative to a block inside the moved subtree."
                })
            
            # prevenzione: non puoi attaccare il subtree dentro se stesso
            if target_parent and target_parent.id in seen:
                raise ValidationError({"to_parent_block": "Cannot move subtree inside its own descendant."})

            # ---- calcola new position per root nella target (stesso parent target_parent)
            siblings_qs = Block.objects.select_for_update().filter(
                page=to_page,
                parent_block=target_parent
            ).order_by("position", "id")

            if after_block_id is not None:
                # after deve essere sibling (stesso parent) nella target
                try:
                    after = siblings_qs.get(id=after_block_id)
                except Block.DoesNotExist:
                    raise ValidationError({"after_block_id": "after_block_id must be a sibling under target parent in target page."})

                prev_pos = after.position

                # prossimo sibling = primo con position > prev_pos
                nxt = siblings_qs.filter(position__gt=prev_pos).first()
                next_pos = nxt.position if nxt else None

                new_root_pos = generate_key_between(prev_pos, next_pos)
            else:
                # append in coda
                last = siblings_qs.last()
                prev_pos = last.position if last else None
                new_root_pos = generate_key_between(prev_pos, None)

            # ---- sposta tutti i nodi del subtree nella nuova pagina
            Block.objects.filter(id__in=subtree_ids).update(page=to_page)

            # ---- aggiorna root: parent_block + position
            root.parent_block = target_parent
            root.position = new_root_pos
            root.save(update_fields=["parent_block", "position"])

            moved_blocks = Block.objects.filter(id__in=subtree_ids).order_by("parent_block_id", "position")
            return Response(
            {
                "ok": True,
                "from_page_id": str(from_page.id),
                "to_page_id": str(to_page.id),
                "root_id": str(root.id),
                "new_root_position": new_root_pos,
                "blocks": BlockSerializer(moved_blocks, many=True).data
            },
            status=status.HTTP_200_OK
            )

    @action(detail=True, methods=["post"], url_path="duplicate-deep")
    def duplicate_deep(self, request, pk=None):
        src = self.get_object()  # ownership ok
        ser = DuplicatePageDeepSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        include_children = ser.validated_data.get("include_children", False)
        custom_title = ser.validated_data.get("title", None)

        owner = request.user

        with transaction.atomic():
            # -------------------------
            # 1) calcola nuova position pagina (subito dopo src fra i siblings)
            # -------------------------
            sibs = list(
                Page.objects.select_for_update()
                .filter(owner=owner, parent_id=src.parent_id)
                .order_by("position", "created_at")
                .values_list("id", "position")
            )
            idx = next((i for i, (pid, _) in enumerate(sibs) if pid == src.id), -1)
            next_pos = sibs[idx + 1][1] if idx != -1 and idx + 1 < len(sibs) else None
            new_page_pos = generate_key_between(src.position or None, next_pos)

            # -------------------------
            # 2) duplica root page
            # -------------------------
            new_root_id = uuid.uuid4()
            new_root = Page(
                id=new_root_id,
                owner=owner,
                title=(custom_title if (custom_title is not None) else f"Copy of {src.title or 'Untitled'}"),
                icon=src.icon,
                favorite=False,     # di solito copy non è favorite (puoi copiarlo se vuoi)
                parent_id=src.parent_id,
                position=new_page_pos,
                favorite_position=None,
            )
            new_root.save()

            # -------------------------
            # 3) se include_children, duplica anche subtree pages
            # -------------------------
            page_id_map = {src.id: new_root.id}  # old_page_id -> new_page_id
            src_pages = [src]  # lista delle pagine sorgenti incluse (root + disc)
            if include_children:
                # BFS su pages (tutte dello stesso owner)
                q = [src.id]
                while q:
                    cur = q.pop(0)
                    kids = list(
                        Page.objects.select_for_update()
                        .filter(owner=owner, parent_id=cur)
                        .order_by("position", "created_at")
                    )
                    for k in kids:
                        src_pages.append(k)
                        q.append(k.id)

                # crea tutte le pagine discendenti (escludi src già fatto)
                to_create = []
                for p in src_pages[1:]:
                    new_id = uuid.uuid4()
                    page_id_map[p.id] = new_id
                    to_create.append(Page(
                        id=new_id,
                        owner=owner,
                        title=(p.title or "Untitled"),
                        icon=p.icon,
                        favorite=False,
                        parent_id=page_id_map.get(p.parent_id),   # parent rimappato dentro la copia
                        position=p.position,                      # copia position: ordine identico nel subtree
                    ))
                if to_create:
                    Page.objects.bulk_create(to_create, batch_size=500)

            # -------------------------
            # 4) duplica i blocks per tutte le pagine copiate (root + eventualmente disc)
            #    - preserva position identica
            #    - preserva gerarchia parent_block
            #    - performante: bulk_create + bulk_update parent
            # -------------------------
            # prendi tutti i blocks delle pagine sorgenti coinvolte
            src_page_ids = [p.id for p in src_pages]
            all_src_blocks = list(
                Block.objects.select_for_update()
                .filter(page_id__in=src_page_ids)
                .values(
                    "id", "page_id", "parent_block_id", "kind", "type",
                    "content", "props", "layout", "width", "position", "version"
                )
            )

            # prepara mapping old_block_id -> new_block_id
            block_id_map = {}
            new_blocks = []

            # pre-assegna id nuovi (così puoi rimappare parent dopo)
            for b in all_src_blocks:
                block_id_map[b["id"]] = uuid.uuid4()

            # crea righe nuove con parent temporaneamente NULL (poi bulk_update)
            for b in all_src_blocks:
                new_blocks.append(Block(
                    id=block_id_map[b["id"]],
                    page_id=page_id_map[b["page_id"]],
                    parent_block_id=None,  # set dopo
                    kind=b["kind"],
                    type=b["type"],
                    content=b["content"] or {},
                    props=b["props"] or {},
                    layout=b["layout"] or {},
                    width=b["width"],
                    position=b["position"],     # ✅ ordine preservato
                    version=1,                  # opzionale: reset
                ))

            if new_blocks:
                Block.objects.bulk_create(new_blocks, batch_size=1000)

                # ora setti parent_block rimappato (solo se parent era dentro lo stesso set)
                # NB: parent_block dei blocks è sempre nella stessa pagina, quindi è presente nel mapping.
                to_update = []
                for b in all_src_blocks:
                    old_parent = b["parent_block_id"]
                    if old_parent is None:
                        continue
                    new_id = block_id_map[b["id"]]
                    new_parent_id = block_id_map.get(old_parent)
                    if new_parent_id is None:
                        continue
                    to_update.append(Block(id=new_id, parent_block_id=new_parent_id))

                if to_update:
                    Block.objects.bulk_update(to_update, ["parent_block"], batch_size=1000)

            return Response(
                {
                    "ok": True,
                    "source_page_id": str(src.id),
                    "new_page_id": str(new_root.id),
                    "include_children": include_children,
                },
                status=status.HTTP_201_CREATED
            )

    def _append_favorite_position(self, owner, parent_id=None):
       
        qs = Page.objects.select_for_update().filter(
            owner=owner,
            favorite=True
        ).exclude(favorite_position__isnull=True).order_by("favorite_position")

        last = qs.last()
        prev_pos = last.favorite_position if last else None
        return generate_key_between(prev_pos, None)

    def perform_update(self, serializer):
        with transaction.atomic():
            instance = self.get_object()
            old_fav = instance.favorite
            old_pos = instance.favorite_position

            updated = serializer.save()  # applica patch

            # se tolgo favorite -> pulisco favorite_position
            if old_fav and not updated.favorite:
                if updated.favorite_position is not None:
                    updated.favorite_position = None
                    updated.save(update_fields=["favorite_position"])

            # se metto favorite e non ho pos -> append in coda
            if (not old_fav) and updated.favorite:
                if not updated.favorite_position:
                    updated.favorite_position = self._append_favorite_position(owner=self.request.user)
                    updated.save(update_fields=["favorite_position"])

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

        parent = serializer.validated_data.get("parent_block")

        if parent and parent.page_id != page.id:
            raise ValidationError({
                "parent_block": "parent_block must belong to the same page"
            })

        

        serializer.save()

    @action(detail=True, methods=["post"], url_path="duplicate-subtree")
    def duplicate_subtree(self, request, pk=None):
        """
        POST /blocks/<block_uuid>/duplicate-subtree/
        Body (optional):
          {
            "to_parent_block": "<uuid|null>",   # default: stesso parent dell’originale
            "after_block_id": "<uuid|null>"     # default: dopo l’originale (se stesso parent)
          }

        Duplica un blocco + tutti i suoi discendenti nella STESSA pagina.
        Operazione atomica (transaction).
        """
        src_root = self.get_object()  # ownership ok via queryset
        page = src_root.page

        ser = DuplicateBlockSubtreeSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data

        with transaction.atomic():
            # ------------------------------------------------------------
            # 1) Lock + costruisci children map per tutta la pagina
            # ------------------------------------------------------------
            rows = list(
                Block.objects.select_for_update()
                .filter(page=page)
                .values_list("id", "parent_block_id", "position")
            )

            children = {}
            for bid, pid, _pos in rows:
                children.setdefault(pid, []).append(bid)

            # ------------------------------------------------------------
            # 2) DFS per ottenere subtree_ids + set "seen"
            # ------------------------------------------------------------
            subtree_ids = []
            seen = set()
            stack = [src_root.id]
            while stack:
                cur = stack.pop()
                if cur in seen:
                    continue
                seen.add(cur)
                subtree_ids.append(cur)
                for ch in children.get(cur, []):
                    stack.append(ch)

            # ------------------------------------------------------------
            # 3) Preload in 1 query tutti i blocchi del subtree
            # ------------------------------------------------------------
            src_blocks = {
                b.id: b
                for b in Block.objects.select_for_update().filter(id__in=subtree_ids)
            }

            # ------------------------------------------------------------
            # 4) Target parent (default: stesso parent del root originale)
            # ------------------------------------------------------------
            if "to_parent_block" in data:
                to_parent_block_id = data.get("to_parent_block")
            else:
                to_parent_block_id = src_root.parent_block_id

            target_parent = None
            if to_parent_block_id is not None:
                try:
                    target_parent = Block.objects.select_for_update().get(
                        id=to_parent_block_id,
                        page=page,
                    )
                except Block.DoesNotExist:
                    raise ValidationError({"to_parent_block": "Target parent must belong to the same page."})

            # Non permettere di inserire dentro un discendente del subtree
            if target_parent and target_parent.id in seen:
                raise ValidationError({"to_parent_block": "Cannot duplicate subtree inside its own descendant."})

            # ------------------------------------------------------------
            # 5) after_block_id default:
            #    - se non specificato e stiamo duplicando nello stesso parent del root,
            #      default = dopo l’originale
            # ------------------------------------------------------------
            if "after_block_id" in data:
                after_block_id = data.get("after_block_id")
            else:
                same_parent = (
                    (target_parent is None and src_root.parent_block_id is None) or
                    (target_parent is not None and src_root.parent_block_id == target_parent.id)
                )
                after_block_id = src_root.id if same_parent else None

            # after_block non può essere dentro subtree
            #if after_block_id is not None and after_block_id in seen:
             #   raise ValidationError({"after_block_id": "Cannot insert relative to a block inside the duplicated subtree."})

            # ------------------------------------------------------------
            # 6) Calcola nuova position del root duplicato nel target_parent
            # ------------------------------------------------------------
            siblings_qs = (
                Block.objects.select_for_update()
                .filter(page=page, parent_block=target_parent)
                .order_by("position", "id")
            )

            if after_block_id is not None:
                try:
                    after = siblings_qs.get(id=after_block_id)
                except Block.DoesNotExist:
                    raise ValidationError({"after_block_id": "after_block_id must be a sibling under target parent in this page."})

                prev_pos = after.position
                nxt = siblings_qs.filter(position__gt=prev_pos).first()
                next_pos = nxt.position if nxt else None
                new_root_pos = generate_key_between(prev_pos, next_pos)
            else:
                last = siblings_qs.last()
                prev_pos = last.position if last else None
                new_root_pos = generate_key_between(prev_pos, None)

            # ------------------------------------------------------------
            # 7) Pre-assegna nuovi UUID per tutti i nodi duplicati
            # ------------------------------------------------------------
            id_map = {old_id: uuid.uuid4() for old_id in subtree_ids}

            # ------------------------------------------------------------
            # 8) bulk_create dei duplicati (parent già rimappato)
            # ------------------------------------------------------------
            to_create = []

            for old_id in subtree_ids:
                old = src_blocks[old_id]
                new_id = id_map[old_id]

                if old_id == src_root.id:
                    new_parent_id = target_parent.id if target_parent else None
                    new_pos = new_root_pos
                else:
                    # parent del figlio è sempre dentro subtree => rimappa
                    new_parent_id = id_map.get(old.parent_block_id)
                    new_pos = old.position  # copia per preservare ordering tra siblings duplicati

                to_create.append(Block(
                    id=new_id,
                    page=page,
                    parent_block_id=new_parent_id,
                    kind=old.kind,
                    type=old.type,
                    content=old.content or {},
                    props=old.props or {},
                    layout=old.layout or {},
                    width=old.width,
                    position=new_pos,
                    version=1,
                ))

            Block.objects.bulk_create(to_create, batch_size=1000)

            new_root_id = id_map[src_root.id]

        return Response(
            {
                "ok": True,
                "new_root_id": str(new_root_id),
                "duplicated_count": len(subtree_ids),
            },
            status=status.HTTP_201_CREATED,
        )