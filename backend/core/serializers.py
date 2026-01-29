from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import (
    Page,
    TiptapDocument,
    PageCollaborator,
    PageInvite,
    PageAuditLog,
    CollaborationRole,
    CommentThread,
    Comment,
)

User = get_user_model()

class PageSerializer(serializers.ModelSerializer):
    tiptap_doc_id = serializers.UUIDField(source="tiptap_doc.id", read_only=True, allow_null=True)
    role = serializers.SerializerMethodField()
    is_shared = serializers.SerializerMethodField()
    favorite = serializers.SerializerMethodField()
    favorite_position = serializers.SerializerMethodField()

    class Meta:
        model = Page
        fields = [
            'id',
            'title',
            'created_at',
            'updated_at',
            'position',
            'parent',
            'icon',
            'favorite',
            'favorite_position',
            'deleted_at',
            'deleted_by',
            'trashed_parent',
            'trashed_position',
            'trashed_favorite',
            'trashed_favorite_position',
            'tiptap_doc_id',
            'role',
            'is_shared',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_role(self, obj):
        request = self.context.get("request")
        if not request or not getattr(request, "user", None):
            return None
        user = request.user
        if user.is_authenticated and obj.owner_id == user.id:
            return CollaborationRole.OWNER
        collab = PageCollaborator.objects.filter(page=obj, user=user).only("role").first()
        return collab.role if collab else None

    def get_is_shared(self, obj):
        return PageCollaborator.objects.filter(page=obj).exists()

    def _get_user(self):
        request = self.context.get("request")
        if not request or not getattr(request, "user", None):
            return None
        user = request.user
        if not user.is_authenticated:
            return None
        return user

    def get_favorite(self, obj):
        user = self._get_user()
        if not user:
            return False
        return obj.favorites.filter(user=user).exists()

    def get_favorite_position(self, obj):
        user = self._get_user()
        if not user:
            return None
        fav = obj.favorites.filter(user=user).only("position").first()
        return fav.position if fav else None

class PageDetailSerializer(PageSerializer):
    tiptap_doc = serializers.SerializerMethodField()

    class Meta(PageSerializer.Meta):
        fields = PageSerializer.Meta.fields + ['tiptap_doc']

    def get_tiptap_doc(self, obj):
        doc = getattr(obj, "tiptap_doc", None)
        if not doc:
            return None
        return TiptapDocumentSerializer(doc).data

class TiptapDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = TiptapDocument
        fields = [
            "id",
            "page",
            "content",
            "version",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class UserSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "email"]


class PageCollaboratorSerializer(serializers.ModelSerializer):
    user = UserSummarySerializer(read_only=True)

    class Meta:
        model = PageCollaborator
        fields = [
            "id",
            "page",
            "user",
            "role",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "page", "created_at", "updated_at", "user"]


class PageInviteSerializer(serializers.ModelSerializer):
    inviter = UserSummarySerializer(read_only=True)
    invitee = UserSummarySerializer(read_only=True)
    page_title = serializers.SerializerMethodField()

    class Meta:
        model = PageInvite
        fields = [
            "id",
            "page",
            "page_title",
            "inviter",
            "invitee",
            "role",
            "status",
            "created_at",
            "updated_at",
            "responded_at",
            "expires_at",
        ]
        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
            "responded_at",
            "inviter",
            "invitee",
        ]

    def get_page_title(self, obj):
        page = getattr(obj, "page", None)
        return getattr(page, "title", None) if page else None


class PageAuditLogSerializer(serializers.ModelSerializer):
    actor = UserSummarySerializer(read_only=True)
    target_user = UserSummarySerializer(read_only=True)

    class Meta:
        model = PageAuditLog
        fields = [
            "id",
            "page",
            "actor",
            "target_user",
            "action",
            "role_before",
            "role_after",
            "meta",
            "created_at",
        ]
        read_only_fields = ["id", "created_at", "actor", "target_user"]


class CommentSerializer(serializers.ModelSerializer):
    author = UserSummarySerializer(read_only=True)

    class Meta:
        model = Comment
        fields = [
            "id",
            "thread",
            "author",
            "body",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "thread", "author", "created_at", "updated_at"]


class CommentThreadSerializer(serializers.ModelSerializer):
    created_by = UserSummarySerializer(read_only=True)
    comments = CommentSerializer(many=True, read_only=True)

    class Meta:
        model = CommentThread
        fields = [
            "id",
            "page",
            "doc_node_id",
            "created_by",
            "resolved",
            "created_at",
            "updated_at",
            "comments",
        ]
        read_only_fields = [
            "id",
            "page",
            "created_by",
            "created_at",
            "updated_at",
            "comments",
        ]

class DuplicatePageDeepSerializer(serializers.Serializer):
    include_children = serializers.BooleanField(required=False, default=False)
    title = serializers.CharField(required=False, allow_blank=True)

class TrashPageSerializer(serializers.Serializer):
    include_children = serializers.BooleanField(required=False, default=True)

class RestorePageSerializer(serializers.Serializer):
    include_children = serializers.BooleanField(required=False, default=True)

class PurgePageSerializer(serializers.Serializer):
    include_children = serializers.BooleanField(required=False, default=True)
