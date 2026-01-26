from rest_framework import serializers
from .models import Page, Block, BlockType, BlockKind

ALLOWED_CODE_LANGS = {
    "plaintext", "javascript", "typescript", "python", "json", "bash", "sql",
    "html", "css", "markdown", "yaml"
}

def normalize_block_content(block_type: str, content):
    if content is None:
        content = {}
    if not isinstance(content, dict):
        raise serializers.ValidationError("content must be an object")

    # default text per blocchi che lo usano
    if block_type in {
        BlockType.PARAGRAPH, BlockType.H1, BlockType.H2, BlockType.H3,
        BlockType.BULLETED_LIST, BlockType.NUMBERED_LIST, BlockType.TODO,
        BlockType.CODE, BlockType.QUOTE, BlockType.CALLOUT, BlockType.TOGGLE,
        BlockType.DIVIDER
    }:
        text = content.get("text", "")
        if text is None:
            text = ""
        if not isinstance(text, str):
            raise serializers.ValidationError({"content": {"text": "must be a string"}})
        content["text"] = text

    # code: language opzionale
    if block_type == BlockType.CODE:
        lang = content.get("language", "plaintext")
        if lang is None or lang == "":
            lang = "plaintext"
        if not isinstance(lang, str):
            raise serializers.ValidationError({"content": {"language": "must be a string"}})
        lang = lang.strip().lower()
        if len(lang) > 32:
            raise serializers.ValidationError({"content": {"language": "too long"}})

        # scegli: fallback o errore
        if lang not in ALLOWED_CODE_LANGS:
            lang = "plaintext"   # fallback “tollerante”
            # oppure: raise serializers.ValidationError({"content": {"language": "unsupported"}})

        content["language"] = lang

    return content

class BlockSerializer(serializers.ModelSerializer):
    class Meta:
        model = Block
        fields = ['id', 'page', 'parent_block', 'kind', 'type', 'content', 'layout', 'width', 'position', 'created_at', 'updated_at', 'props']
        read_only_fields = ['id', 'page', 'created_at', 'updated_at']

    def validate(self, attrs):
        kind = attrs.get("kind", getattr(self.instance, "kind", BlockKind.BLOCK))
        # su update parziale devi considerare valori già presenti
        if kind == BlockKind.BLOCK: 
            block_type = attrs.get("type", getattr(self.instance, "type", BlockType.PARAGRAPH))
            content = attrs.get("content", getattr(self.instance, "content", {}))
            attrs["content"] = normalize_block_content(block_type, content)
        return attrs

class BlockCreateSerializer(serializers.ModelSerializer):
    # qui page è scrivibile, ma verrà controllata
    id = serializers.UUIDField(required=False) 
    page = serializers.PrimaryKeyRelatedField(queryset=Page.objects.all(), required=False)

    class Meta:
        model = Block
        fields = ['id', 'page', 'parent_block', 'kind', 'type', 'content', 'layout', 'width', 'position', 'created_at', 'updated_at','props']
        read_only_fields = ['created_at', 'updated_at']
    
    def validate(self, attrs):
        kind = attrs.get("kind", BlockKind.BLOCK)
        page = attrs.get("page")
        parent = attrs.get("parent_block")

        if parent and page and parent.page_id != page.id:
            raise serializers.ValidationError({"parent_block": "parent_block must belong to the same page"})
        
        if kind == BlockKind.BLOCK:
            block_type = attrs.get("type", BlockType.PARAGRAPH)
            content = attrs.get("content", {})
            attrs["content"] = normalize_block_content(block_type, content)
        else:
            attrs.setdefault("content", {})
        return attrs
    
class RecursiveField(serializers.Field):
    """Permette a un serializer di referenziarsi ricorsivamente (children)."""
    def to_internal_value(self, data):
        parent = self.parent
        # se il field è ListSerializer -> parent.parent è il serializer “vero”
        serializer = parent.parent.__class__(context=self.context)
        return serializer.to_internal_value(data)

    def to_representation(self, value):
        parent = self.parent
        serializer = parent.parent.__class__(context=self.context)
        return serializer.to_representation(value)

class BlockBatchItemSerializer(serializers.Serializer):
    tempId = serializers.CharField(required=False)
    kind = serializers.CharField()
    type = serializers.CharField()

    content = serializers.JSONField(required=False)
    props = serializers.JSONField(required=False)
    layout = serializers.JSONField(required=False)
    width = serializers.IntegerField(required=False, allow_null=True)

    # ✅ nuovo: children ricorsivo
    children = serializers.ListField(
        child=RecursiveField(),
        required=False,
        allow_empty=True,
    )

    def validate(self, attrs):
        # normalizza defaults
        attrs.setdefault("content", {})
        attrs.setdefault("props", {})
        attrs.setdefault("layout", {})

        # applica normalizzazione content come fai già
        kind = attrs.get("kind", BlockKind.BLOCK)
        if kind == BlockKind.BLOCK:
            block_type = attrs.get("type", BlockType.PARAGRAPH)
            attrs["content"] = normalize_block_content(block_type, attrs.get("content"))
        else:
            # se hai altri kind, decidi la policy
            attrs["content"] = attrs.get("content") or {}

        return attrs

class BlockBatchCreateSerializer(serializers.Serializer):
    parent_block = serializers.UUIDField(required=False, allow_null=True)
    after_block_id = serializers.UUIDField(required=False, allow_null=True)
    blocks = BlockBatchItemSerializer(many=True)

    MAX_NODES = 2000
    MAX_DEPTH = 50  # scegli tu

    def _walk(self, items, depth=0):
        if depth > self.MAX_DEPTH:
            raise serializers.ValidationError(f"tree too deep (>{self.MAX_DEPTH})")
        for it in items:
            yield it, depth
            ch = it.get("children") or []
            yield from self._walk(ch, depth + 1)

    def validate(self, attrs):
        blocks = attrs.get("blocks") or []
        if not blocks:
            raise serializers.ValidationError({"blocks": "blocks cannot be empty"})

        # conta nodi + tempId unique
        count = 0
        seen = set()
        for it, depth in self._walk(blocks, 0):
            count += 1
            tid = it.get("tempId")
            if tid:
                if tid in seen:
                    raise serializers.ValidationError({"blocks": f"duplicate tempId: {tid}"})
                seen.add(tid)

        if count > self.MAX_NODES:
            raise serializers.ValidationError({"blocks": f"too many blocks (>{self.MAX_NODES})"})

        return attrs
    
class PageSerializer(serializers.ModelSerializer):
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
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

class PageDetailSerializer(PageSerializer):
    blocks = serializers.SerializerMethodField()

    class Meta(PageSerializer.Meta):
        fields = PageSerializer.Meta.fields + ['blocks']
    
    def get_blocks(self, obj):
        qs = Block.objects.filter(page=obj).order_by("parent_block_id", "position", "id")
        return BlockSerializer(qs, many=True).data

class TransferSubtreeSerializer(serializers.Serializer):
    root_id = serializers.UUIDField()
    to_page_id = serializers.UUIDField()
    to_parent_block = serializers.UUIDField(required=False, allow_null=True)
    after_block_id = serializers.UUIDField(required=False, allow_null=True)

class DuplicatePageDeepSerializer(serializers.Serializer):
    include_children = serializers.BooleanField(required=False, default=False)
    title = serializers.CharField(required=False, allow_blank=True)

class TrashPageSerializer(serializers.Serializer):
    include_children = serializers.BooleanField(required=False, default=True)

class RestorePageSerializer(serializers.Serializer):
    include_children = serializers.BooleanField(required=False, default=True)

class PurgePageSerializer(serializers.Serializer):
    include_children = serializers.BooleanField(required=False, default=True)

class DuplicateBlockSubtreeSerializer(serializers.Serializer):
    # opzionale: cambia destinazione dentro la stessa pagina
    to_parent_block = serializers.UUIDField(required=False, allow_null=True)
    # opzionale: inserisci dopo un sibling (sotto to_parent_block)
    after_block_id = serializers.UUIDField(required=False, allow_null=True)