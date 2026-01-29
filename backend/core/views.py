from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from django.db.models import Q
from rest_framework.exceptions import ValidationError
from .serializers import DuplicatePageDeepSerializer
from django.db import transaction, IntegrityError
from fractional_indexing import generate_key_between
from collections import defaultdict
from django.utils import timezone
from datetime import timedelta
from django.http import Http404
from django.contrib.auth import get_user_model
import json
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync


import uuid

from .models import (
    Page,
    TiptapDocument,
    PageCollaborator,
    PageFavorite,
    PageInvite,
    PageAuditLog,
    CollaborationRole,
    InviteStatus,
    CommentThread,
    Comment,
)
from .serializers import (
    PageSerializer,
    PageDetailSerializer,
    TiptapDocumentSerializer,
    TrashPageSerializer,
    RestorePageSerializer,
    PurgePageSerializer,
    PageCollaboratorSerializer,
    PageInviteSerializer,
    PageAuditLogSerializer,
    UserSummarySerializer,
    CommentThreadSerializer,
    CommentSerializer,
)
from django.conf import settings
from .utils.yjs_compact import compact_room

User = get_user_model()


def get_page_role(page: Page, user) -> str | None:
    if not user or not user.is_authenticated:
        return None
    if page.owner_id == user.id:
        return CollaborationRole.OWNER
    collab = PageCollaborator.objects.filter(page=page, user=user).only("role").first()
    return collab.role if collab else None


def require_page_role(page: Page, user, allowed_roles: set[str]) -> str:
    role = get_page_role(page, user)
    if role is None or role not in allowed_roles:
        raise PermissionDenied("access denied")
    return role


def log_audit(page: Page, actor, action: str, target_user=None, role_before=None, role_after=None, meta=None):
    PageAuditLog.objects.create(
        page=page,
        actor=actor,
        target_user=target_user,
        action=action,
        role_before=role_before,
        role_after=role_after,
        meta=meta or {},
    )

class PageViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        lookup_value = self.kwargs.get(self.lookup_field or "pk")
        page = Page.objects.filter(pk=lookup_value).first()
        if not page:
            raise Http404

        role = get_page_role(page, self.request.user)
        if role is None:
            raise PermissionDenied("access denied")

        include_trashed = self.request.query_params.get("include_trashed") in {
            "1",
            "true",
            "yes",
        }
        if (
            page.deleted_at
            and not include_trashed
            and self.action not in {"restore", "purge", "trash", "trash_list"}
        ):
            raise PermissionDenied("access denied")

        return page

    def get_queryset(self):
        if not getattr(self.request, "user", None) or not self.request.user.is_authenticated:
            return Page.objects.none()

        if self.action == "trash_list":
            qs = Page.objects.filter(owner=self.request.user)
        else:
            qs = Page.objects.filter(
                Q(owner=self.request.user) | Q(collaborators__user=self.request.user)
            ).distinct()

        include_trashed = self.request.query_params.get("include_trashed") in {
            "1",
            "true",
            "yes",
        }

        if not include_trashed and self.action not in {"restore", "purge", "trash_list"}:
            qs = qs.filter(deleted_at__isnull=True)

        return qs.order_by('-created_at')

    def _collect_descendant_ids(self, root_id):
        rows = list(
            Page.objects.filter(owner=self.request.user)
            .values_list("id", "parent_id")
        )

        children = {}
        for pid, parent_id in rows:
            children.setdefault(parent_id, []).append(pid)

        out = set()
        stack = [root_id]
        while stack:
            cur = stack.pop()
            if cur in out:
                continue
            out.add(cur)
            for ch in children.get(cur, []):
                stack.append(ch)
        return out

    def _soft_delete_pages(self, page_ids, user):
        pages = list(
            Page.objects.select_for_update()
            .filter(owner=user, id__in=page_ids)
        )
        if not pages:
            return 0

        now = timezone.now()
        for p in pages:
            if p.deleted_at:
                continue
            p.deleted_at = now
            p.deleted_by = user
            p.trashed_parent_id = p.parent_id
            p.trashed_position = p.position
            p.trashed_favorite = p.favorite
            p.trashed_favorite_position = p.favorite_position

            p.favorite = False
            p.favorite_position = None
            p.parent_id = None

        Page.objects.bulk_update(
            pages,
            [
                "deleted_at",
                "deleted_by",
                "trashed_parent",
                "trashed_position",
                "trashed_favorite",
                "trashed_favorite_position",
                "favorite",
                "favorite_position",
                "parent",
            ],
            batch_size=500,
        )
        return len(pages)

    def _restore_pages(self, page_ids, user):
        pages = list(
            Page.objects.select_for_update()
            .filter(owner=user, id__in=page_ids)
        )
        if not pages:
            return 0

        ids_set = {p.id for p in pages}
        trashed_parent_ids = {p.trashed_parent_id for p in pages if p.trashed_parent_id}

        valid_external_parents = set(
            Page.objects.filter(
                owner=user,
                id__in=trashed_parent_ids - ids_set,
                deleted_at__isnull=True,
            ).values_list("id", flat=True)
        )

        for p in pages:
            if not p.deleted_at:
                continue

            target_parent_id = None
            if p.trashed_parent_id in ids_set:
                target_parent_id = p.trashed_parent_id
            elif p.trashed_parent_id in valid_external_parents:
                target_parent_id = p.trashed_parent_id

            p.parent_id = target_parent_id
            if p.trashed_position:
                p.position = p.trashed_position

            p.favorite = bool(p.trashed_favorite)
            if p.favorite:
                if p.trashed_favorite_position:
                    p.favorite_position = p.trashed_favorite_position
                else:
                    p.favorite_position = self._append_favorite_position(owner=user)
            else:
                p.favorite_position = None

            p.deleted_at = None
            p.deleted_by = None
            p.trashed_parent = None
            p.trashed_position = None
            p.trashed_favorite = False
            p.trashed_favorite_position = None

        Page.objects.bulk_update(
            pages,
            [
                "parent",
                "position",
                "favorite",
                "favorite_position",
                "deleted_at",
                "deleted_by",
                "trashed_parent",
                "trashed_position",
                "trashed_favorite",
                "trashed_favorite_position",
            ],
            batch_size=500,
        )
        return len(pages)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    def update(self, request, *args, **kwargs):
        page = self.get_object()
        require_page_role(page, request.user, {CollaborationRole.OWNER, CollaborationRole.EDITOR})
        return super().update(request, *args, **kwargs)

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return PageDetailSerializer
        return PageSerializer

    def destroy(self, request, *args, **kwargs):
        page = self.get_object()
        require_page_role(page, request.user, {CollaborationRole.OWNER})
        ser = TrashPageSerializer(data=request.data or {})
        ser.is_valid(raise_exception=True)
        include_children = ser.validated_data.get("include_children", True)

        ids = (
            self._collect_descendant_ids(page.id)
            if include_children
            else {page.id}
        )

        with transaction.atomic():
            self._soft_delete_pages(ids, request.user)

        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["get"], url_path="trash")
    def trash_list(self, request):
        qs = Page.objects.filter(owner=request.user, deleted_at__isnull=False)
        qs = qs.order_by("-deleted_at")
        return Response(PageSerializer(qs, many=True).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="trash")
    def trash(self, request, pk=None):
        page = self.get_object()
        require_page_role(page, request.user, {CollaborationRole.OWNER})
        ser = TrashPageSerializer(data=request.data or {})
        ser.is_valid(raise_exception=True)
        include_children = ser.validated_data.get("include_children", True)

        ids = (
            self._collect_descendant_ids(page.id)
            if include_children
            else {page.id}
        )

        with transaction.atomic():
            count = self._soft_delete_pages(ids, request.user)

        return Response({"ok": True, "trashed_count": count}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="restore")
    def restore(self, request, pk=None):
        page = self.get_object()
        require_page_role(page, request.user, {CollaborationRole.OWNER})
        ser = RestorePageSerializer(data=request.data or {})
        ser.is_valid(raise_exception=True)
        include_children = ser.validated_data.get("include_children", True)

        ids = (
            self._collect_descendant_ids(page.id)
            if include_children
            else {page.id}
        )

        with transaction.atomic():
            count = self._restore_pages(ids, request.user)

        return Response({"ok": True, "restored_count": count}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["delete"], url_path="purge")
    def purge(self, request, pk=None):
        page = self.get_object()
        require_page_role(page, request.user, {CollaborationRole.OWNER})
        ser = PurgePageSerializer(data=request.data or {})
        ser.is_valid(raise_exception=True)
        include_children = ser.validated_data.get("include_children", True)

        ids = (
            self._collect_descendant_ids(page.id)
            if include_children
            else {page.id}
        )

        Page.objects.filter(owner=request.user, id__in=ids).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="duplicate-deep")
    def duplicate_deep(self, request, pk=None):
        src = self.get_object()  # ownership ok
        require_page_role(src, request.user, {CollaborationRole.OWNER, CollaborationRole.EDITOR})
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
            # 4) duplica i tiptap docs per tutte le pagine copiate (root + eventualmente disc)
            # -------------------------
            src_page_ids = [p.id for p in src_pages]
            docs = list(
                TiptapDocument.objects.select_for_update()
                .filter(page_id__in=src_page_ids)
                .values("page_id", "content", "version")
            )
            new_docs = []
            for doc in docs:
                new_page_id = page_id_map.get(doc["page_id"])
                if not new_page_id:
                    continue
                new_docs.append(TiptapDocument(
                    id=uuid.uuid4(),
                    page_id=new_page_id,
                    content=doc["content"] or {},
                    version=doc["version"] or 1,
                ))
            if new_docs:
                TiptapDocument.objects.bulk_create(new_docs, batch_size=500)

            return Response(
                {
                    "ok": True,
                    "source_page_id": str(src.id),
                    "new_page_id": str(new_root.id),
                    "include_children": include_children,
                },
                status=status.HTTP_201_CREATED
            )

    
    def _append_favorite_position(self, user):
        qs = PageFavorite.objects.select_for_update().filter(
            user=user,
        ).exclude(position__isnull=True).order_by("position")

        last = qs.last()
        prev_pos = last.position if last else None
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
                    updated.favorite_position = self._append_favorite_position(user=self.request.user)
                    updated.save(update_fields=["favorite_position"])

    @action(detail=True, methods=["post", "delete", "patch"], url_path="favorite")
    def favorite(self, request, pk=None):
        page = self.get_object()
        role = get_page_role(page, request.user)
        if role is None:
            raise PermissionDenied("access denied")

        user = request.user
        favorite = request.data.get("favorite", None)
        position = request.data.get("position", None)

        if request.method == "DELETE" or favorite is False:
            PageFavorite.objects.filter(page=page, user=user).delete()
            return Response(
                {"favorite": False, "favorite_position": None},
                status=status.HTTP_200_OK,
            )

        fav = PageFavorite.objects.filter(page=page, user=user).first()
        if not fav:
            if not position:
                position = self._append_favorite_position(user=user)
            fav = PageFavorite.objects.create(page=page, user=user, position=position)
        else:
            if position is not None:
                fav.position = position
                fav.save(update_fields=["position"])

        return Response(
            {"favorite": True, "favorite_position": fav.position},
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["get", "put", "patch"], url_path="doc")
    def doc(self, request, pk=None):
        page = self.get_object()
        role = get_page_role(page, request.user)
        if role is None:
            raise PermissionDenied("access denied")

        if request.method in {"PUT", "PATCH"}:
            if role not in {CollaborationRole.OWNER, CollaborationRole.EDITOR}:
                raise PermissionDenied("access denied")

        doc, _ = TiptapDocument.objects.get_or_create(page=page)

        if request.method == "GET":
            return Response(TiptapDocumentSerializer(doc).data, status=status.HTTP_200_OK)

        serializer = TiptapDocumentSerializer(
            doc,
            data=request.data,
            partial=(request.method == "PATCH"),
        )
        serializer.is_valid(raise_exception=True)
        serializer.save(page=page)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="doc/compact")
    def doc_compact(self, request, pk=None):
        page = self.get_object()
        role = get_page_role(page, request.user)
        if role is None or role not in {CollaborationRole.OWNER, CollaborationRole.EDITOR}:
            raise PermissionDenied("access denied")

        room_name = f"page:{page.id}"
        ok = compact_room(room_name, str(settings.YJS_STORE_PATH))
        return Response({"compacted": ok}, status=status.HTTP_200_OK)

    # ===========================
    # COMMENTS
    # ===========================

    @action(detail=True, methods=["get", "post"], url_path="comments/threads")
    def comment_threads(self, request, pk=None):
        page = self.get_object()
        role = get_page_role(page, request.user)
        if role is None:
            raise PermissionDenied("access denied")

        if request.method == "GET":
            doc_node_id = request.query_params.get("doc_node_id")
            qs = CommentThread.objects.filter(page=page)
            if doc_node_id:
                qs = qs.filter(doc_node_id=str(doc_node_id))
            qs = qs.order_by("-updated_at")
            return Response(CommentThreadSerializer(qs, many=True).data)

        # POST: create thread (and first comment) or add comment to existing thread
        require_page_role(page, request.user, {CollaborationRole.OWNER, CollaborationRole.EDITOR})

        doc_node_id = request.data.get("doc_node_id")
        body = (request.data.get("body") or "").strip()

        if not doc_node_id:
            raise ValidationError({"doc_node_id": "required"})
        if not body:
            raise ValidationError({"body": "required"})

        thread = CommentThread.objects.filter(
            page=page, doc_node_id=str(doc_node_id), resolved=False
        ).order_by("-updated_at").first()
        if not thread:
            thread = CommentThread.objects.create(
                page=page,
                doc_node_id=str(doc_node_id),
                created_by=request.user,
            )

        Comment.objects.create(thread=thread, author=request.user, body=body)
        thread.refresh_from_db()
        channel_layer = get_channel_layer()
        if channel_layer:
            payload = {
                "type": "thread_created",
                "thread": CommentThreadSerializer(thread).data,
            }
            payload = json.loads(json.dumps(payload, default=str))
            async_to_sync(channel_layer.group_send)(
                f"comments_page_{page.id}",
                {"type": "comments.event", "payload": payload},
            )
        return Response(CommentThreadSerializer(thread).data, status=status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=["get", "post"],
        url_path=r"comments/threads/(?P<thread_id>[^/.]+)/comments",
    )
    def comment_items(self, request, pk=None, thread_id=None):
        page = self.get_object()
        role = get_page_role(page, request.user)
        if role is None:
            raise PermissionDenied("access denied")

        thread = CommentThread.objects.filter(page=page, pk=thread_id).first()
        if not thread:
            raise Http404

        if request.method == "GET":
            items = thread.comments.order_by("created_at")
            return Response(CommentSerializer(items, many=True).data)

        require_page_role(page, request.user, {CollaborationRole.OWNER, CollaborationRole.EDITOR})
        body = (request.data.get("body") or "").strip()
        if not body:
            raise ValidationError({"body": "required"})

        comment = Comment.objects.create(thread=thread, author=request.user, body=body)
        channel_layer = get_channel_layer()
        if channel_layer:
            payload = {
                "type": "comment_created",
                "thread_id": str(thread.id),
                "doc_node_id": thread.doc_node_id,
                "page_id": str(page.id),
                "comment": CommentSerializer(comment).data,
            }
            payload = json.loads(json.dumps(payload, default=str))
            async_to_sync(channel_layer.group_send)(
                f"comments_page_{page.id}",
                {"type": "comments.event", "payload": payload},
            )
        return Response(CommentSerializer(comment).data, status=status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=["patch"],
        url_path=r"comments/threads/(?P<thread_id>[^/.]+)/resolve",
    )
    def comment_thread_resolve(self, request, pk=None, thread_id=None):
        page = self.get_object()
        require_page_role(page, request.user, {CollaborationRole.OWNER})

        thread = CommentThread.objects.filter(page=page, pk=thread_id).first()
        if not thread:
            raise Http404

        doc_node_id = thread.doc_node_id
        thread.comments.all().delete()
        thread.delete()

        channel_layer = get_channel_layer()
        if channel_layer:
            payload = {
                "type": "thread_deleted",
                "thread_id": str(thread_id),
                "doc_node_id": doc_node_id,
                "page_id": str(page.id),
            }
            payload = json.loads(json.dumps(payload, default=str))
            async_to_sync(channel_layer.group_send)(
                f"comments_page_{page.id}",
                {"type": "comments.event", "payload": payload},
            )

        return Response(
            {
                "deleted": True,
                "thread_id": str(thread_id),
                "doc_node_id": doc_node_id,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["get", "patch"], url_path="collaborators")
    def collaborators(self, request, pk=None):
        page = self.get_object()
        role = get_page_role(page, request.user)
        if role is None:
            raise PermissionDenied("access denied")

        if request.method == "GET":
            collabs = PageCollaborator.objects.filter(page=page).select_related("user")
            items = PageCollaboratorSerializer(collabs, many=True).data

            # include page owner as collaborator
            owner_item = {
                "id": f"owner:{page.owner_id}",
                "page": str(page.id),
                "user": UserSummarySerializer(page.owner).data,
                "role": CollaborationRole.OWNER,
                "created_at": page.created_at,
                "updated_at": page.updated_at,
            }
            return Response([owner_item, *items], status=status.HTTP_200_OK)

        # PATCH: update collaborator role
        require_page_role(page, request.user, {CollaborationRole.OWNER})
        user_id = request.data.get("user_id")
        next_role = request.data.get("role")
        if not user_id or not next_role:
            raise ValidationError({"detail": "user_id and role are required"})
        if next_role not in CollaborationRole.values:
            raise ValidationError({"role": "invalid role"})

        if str(page.owner_id) == str(user_id):
            raise ValidationError({"user_id": "owner role is implicit for page owner"})

        collab = PageCollaborator.objects.filter(page=page, user_id=user_id).first()
        if not collab:
            raise ValidationError({"user_id": "collaborator not found"})

        prev_role = collab.role
        if prev_role == next_role:
            return Response(PageCollaboratorSerializer(collab).data, status=status.HTTP_200_OK)

        collab.role = next_role
        collab.save(update_fields=["role", "updated_at"])

        log_audit(
            page,
            actor=request.user,
            action="role_changed",
            target_user=collab.user,
            role_before=prev_role,
            role_after=next_role,
        )

        return Response(PageCollaboratorSerializer(collab).data, status=status.HTTP_200_OK)

    @action(
        detail=True,
        methods=["delete"],
        url_path=r"collaborators/(?P<user_id>[^/.]+)",
    )
    def remove_collaborator(self, request, pk=None, user_id=None):
        page = self.get_object()
        require_page_role(page, request.user, {CollaborationRole.OWNER})

        if str(page.owner_id) == str(user_id):
            raise ValidationError({"user_id": "cannot remove page owner"})

        collab = PageCollaborator.objects.filter(page=page, user_id=user_id).first()
        if not collab:
            raise ValidationError({"user_id": "collaborator not found"})

        prev_role = collab.role
        target_user = collab.user
        collab.delete()

        log_audit(
            page,
            actor=request.user,
            action="collaborator_removed",
            target_user=target_user,
            role_before=prev_role,
        )
        return Response({"ok": True}, status=status.HTTP_200_OK)


class UserLookupViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def list(self, request):
        q = (request.query_params.get("q") or "").strip()
        if not q:
            return Response([], status=status.HTTP_200_OK)

        users = (
            User.objects.filter(
                Q(username__icontains=q)
                | Q(first_name__icontains=q)
                | Q(last_name__icontains=q)
                | Q(email__icontains=q)
            )
            .order_by("username")
            .distinct()[:10]
        )

        return Response(UserSummarySerializer(users, many=True).data, status=status.HTTP_200_OK)


class PageInviteViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def list(self, request):
        page_id = request.query_params.get("page") or request.query_params.get("page_id")
        if not page_id:
            return Response([], status=status.HTTP_200_OK)

        try:
            page = Page.objects.get(id=page_id)
        except Page.DoesNotExist:
            raise ValidationError({"page": "page not found"})

        require_page_role(page, request.user, {CollaborationRole.OWNER, CollaborationRole.EDITOR})

        invites = PageInvite.objects.filter(page=page).select_related("inviter", "invitee")
        return Response(PageInviteSerializer(invites, many=True).data, status=status.HTTP_200_OK)

    def create(self, request):
        page_id = request.data.get("page_id") or request.data.get("page")
        user_id = request.data.get("user_id")
        role = request.data.get("role", CollaborationRole.EDITOR)

        if not page_id or not user_id:
            raise ValidationError({"detail": "page_id and user_id are required"})
        if role not in CollaborationRole.values:
            raise ValidationError({"role": "invalid role"})

        try:
            page = Page.objects.get(id=page_id)
        except Page.DoesNotExist:
            raise ValidationError({"page_id": "page not found"})

        require_page_role(page, request.user, {CollaborationRole.OWNER, CollaborationRole.EDITOR})

        if str(page.owner_id) == str(user_id):
            raise ValidationError({"user_id": "user is already owner"})

        invitee = User.objects.filter(id=user_id).first()
        if not invitee:
            raise ValidationError({"user_id": "user not found"})

        if PageCollaborator.objects.filter(page=page, user=invitee).exists():
            raise ValidationError({"user_id": "user is already a collaborator"})

        existing = PageInvite.objects.filter(
            page=page,
            invitee=invitee,
            status=InviteStatus.PENDING,
        ).first()

        if existing:
            if existing.is_expired():
                existing.status = InviteStatus.EXPIRED
                existing.responded_at = timezone.now()
                existing.save(update_fields=["status", "responded_at", "updated_at"])
            else:
                return Response(PageInviteSerializer(existing).data, status=status.HTTP_200_OK)

        expires_at = timezone.now() + timedelta(days=7)
        invite = PageInvite.objects.create(
            page=page,
            inviter=request.user,
            invitee=invitee,
            role=role,
            expires_at=expires_at,
        )

        log_audit(
            page,
            actor=request.user,
            action="invite_sent",
            target_user=invitee,
            role_after=role,
        )

        return Response(PageInviteSerializer(invite).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="inbox")
    def inbox(self, request):
        now = timezone.now()
        invites = PageInvite.objects.filter(
            invitee=request.user,
            status=InviteStatus.PENDING,
        ).select_related("inviter", "page")

        expired_ids = []
        for inv in invites:
            if inv.is_expired():
                expired_ids.append(inv.id)

        if expired_ids:
            PageInvite.objects.filter(id__in=expired_ids).update(
                status=InviteStatus.EXPIRED,
                responded_at=now,
                updated_at=now,
            )
            invites = invites.exclude(id__in=expired_ids)

        return Response(PageInviteSerializer(invites, many=True).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="accept")
    def accept(self, request, pk=None):
        try:
            invite = PageInvite.objects.select_related("page", "invitee").get(pk=pk)
        except PageInvite.DoesNotExist:
            raise ValidationError({"invite": "not found"})
        if invite.invitee_id != request.user.id:
            raise PermissionDenied("access denied")
        if invite.status != InviteStatus.PENDING:
            raise ValidationError({"status": "invite not pending"})
        if invite.is_expired():
            invite.status = InviteStatus.EXPIRED
            invite.responded_at = timezone.now()
            invite.save(update_fields=["status", "responded_at", "updated_at"])
            raise ValidationError({"status": "invite expired"})

        collab, created = PageCollaborator.objects.get_or_create(
            page=invite.page,
            user=request.user,
            defaults={"role": invite.role, "invited_by": invite.inviter},
        )
        if not created and collab.role != invite.role:
            collab.role = invite.role
            collab.save(update_fields=["role", "updated_at"])

        invite.status = InviteStatus.ACCEPTED
        invite.responded_at = timezone.now()
        invite.save(update_fields=["status", "responded_at", "updated_at"])

        log_audit(
            invite.page,
            actor=request.user,
            action="invite_accepted",
            target_user=request.user,
            role_after=invite.role,
        )

        return Response(PageInviteSerializer(invite).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="decline")
    def decline(self, request, pk=None):
        try:
            invite = PageInvite.objects.select_related("page", "invitee").get(pk=pk)
        except PageInvite.DoesNotExist:
            raise ValidationError({"invite": "not found"})
        if invite.invitee_id != request.user.id:
            raise PermissionDenied("access denied")
        if invite.status != InviteStatus.PENDING:
            raise ValidationError({"status": "invite not pending"})

        invite.status = InviteStatus.DECLINED
        invite.responded_at = timezone.now()
        invite.save(update_fields=["status", "responded_at", "updated_at"])

        log_audit(
            invite.page,
            actor=request.user,
            action="invite_declined",
            target_user=request.user,
            role_after=invite.role,
        )

        return Response(PageInviteSerializer(invite).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        try:
            invite = PageInvite.objects.select_related("page", "inviter").get(pk=pk)
        except PageInvite.DoesNotExist:
            raise ValidationError({"invite": "not found"})
        if invite.status != InviteStatus.PENDING:
            raise ValidationError({"status": "invite not pending"})

        page = invite.page
        role = get_page_role(page, request.user)
        if request.user.id not in {invite.inviter_id, page.owner_id} and role != CollaborationRole.OWNER:
            raise PermissionDenied("access denied")

        invite.status = InviteStatus.CANCELLED
        invite.responded_at = timezone.now()
        invite.save(update_fields=["status", "responded_at", "updated_at"])

        log_audit(
            page,
            actor=request.user,
            action="invite_cancelled",
            target_user=invite.invitee,
            role_after=invite.role,
        )

        return Response(PageInviteSerializer(invite).data, status=status.HTTP_200_OK)


class PageAuditLogViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def list(self, request):
        page_id = request.query_params.get("page") or request.query_params.get("page_id")
        if not page_id:
            return Response([], status=status.HTTP_200_OK)

        try:
            page = Page.objects.get(id=page_id)
        except Page.DoesNotExist:
            raise ValidationError({"page": "page not found"})

        require_page_role(page, request.user, {CollaborationRole.OWNER, CollaborationRole.EDITOR})

        logs = PageAuditLog.objects.filter(page=page).select_related("actor", "target_user").order_by("-created_at")[:200]
        return Response(PageAuditLogSerializer(logs, many=True).data, status=status.HTTP_200_OK)

class TiptapDocumentViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = TiptapDocumentSerializer

    def get_queryset(self):
        if not getattr(self.request, "user", None) or not self.request.user.is_authenticated:
            return TiptapDocument.objects.none()
        return TiptapDocument.objects.select_related("page").filter(
            Q(page__owner=self.request.user) | Q(page__collaborators__user=self.request.user)
        ).distinct()

    def perform_create(self, serializer):
        page = serializer.validated_data.get("page")
        if not page:
            raise ValidationError({"page": "page is required"})

        require_page_role(page, self.request.user, {CollaborationRole.OWNER, CollaborationRole.EDITOR})

        if hasattr(page, "tiptap_doc"):
            raise ValidationError({"page": "tiptap_doc already exists for this page."})

        serializer.save()

    def perform_update(self, serializer):
        instance = self.get_object()
        require_page_role(instance.page, self.request.user, {CollaborationRole.OWNER, CollaborationRole.EDITOR})
        serializer.save()

