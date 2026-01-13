from rest_framework import serializers
from .models import Page, Block, BlockType

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
        BlockType.BULLETED_LIST, BlockType.NUMBERED_LIST, BlockType.CHECKBOX,
        BlockType.CODE
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
        fields = ['id', 'page', 'parent_block', 'type', 'content', 'position', 'created_at', 'updated_at']
        read_only_fields = ['id', 'page', 'created_at', 'updated_at']

    def validate(self, attrs):
        # su update parziale devi considerare valori già presenti
        block_type = attrs.get("type", getattr(self.instance, "type", BlockType.PARAGRAPH))
        content = attrs.get("content", getattr(self.instance, "content", {}))
        attrs["content"] = normalize_block_content(block_type, content)
        return attrs

class BlockCreateSerializer(serializers.ModelSerializer):
    # qui page è scrivibile, ma verrà controllata
    page = serializers.PrimaryKeyRelatedField(queryset=Page.objects.all())

    class Meta:
        model = Block
        fields = ['id', 'page', 'parent_block', 'type', 'content', 'position', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def validate(self, attrs):
        block_type = attrs.get("type", BlockType.PARAGRAPH)
        content = attrs.get("content", {})
        attrs["content"] = normalize_block_content(block_type, content)
        return attrs

class PageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Page
        fields = ['id', 'title', 'created_at', 'updated_at', 'position', 'parent','icon','favorite']
        read_only_fields = ['id', 'created_at', 'updated_at']

class PageDetailSerializer(PageSerializer):
    blocks = BlockSerializer(many=True, read_only=True)

    class Meta(PageSerializer.Meta):
        fields = PageSerializer.Meta.fields + ['blocks']


