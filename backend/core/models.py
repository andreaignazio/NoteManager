from django.db import models
import uuid
from django.conf import settings

class BlockType(models.TextChoices):
    PARAGRAPH = "p", "Paragraph"
    H1 = "h1", "Heading 1"
    H2 = "h2", "Heading 2"
    H3 = "h3", "Heading 3"
    BULLETED_LIST = "ul", "Bulleted List"
    NUMBERED_LIST = 'ol', 'Numbered List'
    CHECKBOX = 'cb', 'Checkbox'
    IMAGE = 'img', 'Image'
    DIVIDER = 'div', 'Divider'
    CODE = "code", "Code"

class BlockKind(models.TextChoices):
    BLOCK = "block", "Block"
    ROW = "row", "Row"
    COLUMN = "column", "Column"


class Page(models.Model):
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
        )
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="pages")
    title = models.CharField(max_length=256, default="")
    icon = models.CharField(max_length=80, blank=True, default="lucide:file")
    parent = models.ForeignKey("self", on_delete=models.CASCADE,
                                null=True, blank=True,
                                related_name="children")
    position = models.CharField(max_length=32, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    favorite = models.BooleanField(default=False)
    def __str__(self):
        return f"{self.title} ({self.owner.username})"

class Block(models.Model):
     id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
        )
     page = models.ForeignKey(Page, on_delete=models.CASCADE, related_name="blocks")
     parent_block = models.ForeignKey("self", on_delete=models.SET_NULL, 
                                      null=True, blank=True,
                                      related_name="children")
     
     kind = models.CharField(max_length=10, choices=BlockKind.choices, default=BlockKind.BLOCK)

     type = models.CharField(max_length=20, choices=BlockType.choices,
                             default=BlockType.PARAGRAPH)
     content = models.JSONField(default=dict, blank=True)

     layout = models.JSONField(default=dict, blank=True)  # per row
     width = models.FloatField(null=True, blank=True)     # per column (o ratio)

     position = models.CharField(max_length=32)

     version = models.IntegerField(default=1)


     created_at = models.DateTimeField(auto_now_add=True)
     updated_at = models.DateTimeField(auto_now=True)
     
     class Meta:
        
        indexes = [
            
            models.Index(fields=['page', 'parent_block', 'position']),

            models.Index(fields=["page", "kind", "parent_block", "position"]),
        ]
        ordering = ['parent_block_id','position'] 

     def __str__(self):
        return f"{self.type} - {self.id} (Pos: {self.position})"



        