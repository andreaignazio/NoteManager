from django.db import models
import uuid
from django.conf import settings
from django.utils import timezone


class CollaborationRole(models.TextChoices):
    OWNER = "owner", "Owner"
    EDITOR = "editor", "Editor"
    VIEWER = "viewer", "Viewer"


class InviteStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    ACCEPTED = "accepted", "Accepted"
    DECLINED = "declined", "Declined"
    CANCELLED = "cancelled", "Cancelled"
    EXPIRED = "expired", "Expired"


class Page(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="pages",
    )
    title = models.CharField(max_length=256, default="")
    icon = models.CharField(max_length=80, blank=True, default="lucide:file")
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="children",
    )
    position = models.CharField(max_length=32, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    favorite = models.BooleanField(default=False)
    favorite_position = models.CharField(max_length=32, null=True, blank=True, db_index=True)

    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    deleted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="deleted_pages",
    )
    trashed_parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="trashed_children",
    )
    trashed_position = models.CharField(max_length=32, null=True, blank=True)
    trashed_favorite = models.BooleanField(default=False)
    trashed_favorite_position = models.CharField(max_length=32, null=True, blank=True)

    def __str__(self):
        return f"{self.title} ({self.owner.username})"


class TiptapDocument(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    page = models.OneToOneField(
        Page,
        on_delete=models.CASCADE,
        related_name="tiptap_doc",
    )
    content = models.JSONField(default=dict, blank=True)
    version = models.IntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"TiptapDocument({self.page_id})"


class PageCollaborator(models.Model):
    page = models.ForeignKey(
        Page,
        on_delete=models.CASCADE,
        related_name="collaborators",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="page_collaborations",
    )
    role = models.CharField(
        max_length=12,
        choices=CollaborationRole.choices,
        default=CollaborationRole.EDITOR,
    )
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="page_collaborator_invites_sent",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ["page", "user"]
        indexes = [
            models.Index(fields=["page", "user"]),
            models.Index(fields=["page", "role"]),
        ]

    def __str__(self):
        return f"{self.page_id}:{self.user_id}:{self.role}"


class PageFavorite(models.Model):
    page = models.ForeignKey(
        Page,
        on_delete=models.CASCADE,
        related_name="favorites",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="page_favorites",
    )
    position = models.CharField(max_length=32, null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ["page", "user"]
        indexes = [
            models.Index(fields=["user", "position"]),
            models.Index(fields=["page", "user"]),
        ]

    def __str__(self):
        return f"Favorite({self.page_id}:{self.user_id})"


class PageInvite(models.Model):
    page = models.ForeignKey(
        Page,
        on_delete=models.CASCADE,
        related_name="invites",
    )
    inviter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="page_invites_sent",
    )
    invitee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="page_invites_received",
    )
    role = models.CharField(
        max_length=12,
        choices=CollaborationRole.choices,
        default=CollaborationRole.EDITOR,
    )
    status = models.CharField(
        max_length=12,
        choices=InviteStatus.choices,
        default=InviteStatus.PENDING,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    responded_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["page", "invitee", "status"]),
            models.Index(fields=["invitee", "status"]),
            models.Index(fields=["expires_at"]),
        ]

    def is_expired(self) -> bool:
        if not self.expires_at:
            return False
        return timezone.now() >= self.expires_at

    def __str__(self):
        return f"Invite({self.page_id}:{self.invitee_id}:{self.status})"


class PageAuditLog(models.Model):
    ACTION_CHOICES = [
        ("invite_sent", "Invite sent"),
        ("invite_accepted", "Invite accepted"),
        ("invite_declined", "Invite declined"),
        ("invite_cancelled", "Invite cancelled"),
        ("role_changed", "Role changed"),
        ("collaborator_removed", "Collaborator removed"),
    ]

    page = models.ForeignKey(
        Page,
        on_delete=models.CASCADE,
        related_name="audit_logs",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="page_audit_actions",
    )
    target_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="page_audit_targets",
    )
    action = models.CharField(max_length=32, choices=ACTION_CHOICES)
    role_before = models.CharField(max_length=12, null=True, blank=True)
    role_after = models.CharField(max_length=12, null=True, blank=True)
    meta = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["page", "created_at"])]

    def __str__(self):
        return f"Audit({self.page_id}:{self.action})"
    EDITOR = "editor", "Editor"

    VIEWER = "viewer", "Viewer"


class CommentThread(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    page = models.ForeignKey(
        Page,
        on_delete=models.CASCADE,
        related_name="comment_threads",
    )
    doc_node_id = models.CharField(max_length=128, db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="comment_threads_created",
    )
    resolved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["page", "doc_node_id", "updated_at"]),
            models.Index(fields=["page", "resolved"]),
        ]

    def __str__(self):
        return f"CommentThread({self.page_id}:{self.doc_node_id})"


class Comment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    thread = models.ForeignKey(
        CommentThread,
        on_delete=models.CASCADE,
        related_name="comments",
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="comments",
    )
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["thread", "created_at"]),
        ]

    def __str__(self):
        return f"Comment({self.thread_id}:{self.author_id})"




