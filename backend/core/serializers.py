from rest_framework import serializers
from .models import Page, Block

class BlockSerializer(serializers.ModelSerializer):
    class Meta:
        model = Block
        fields = ['id', 'page', 'parent_block', 'type', 'content', 'position', 'created_at', 'updated_at']
        read_only_fields = ['id', 'page', 'created_at', 'updated_at']

class BlockCreateSerializer(serializers.ModelSerializer):
    # qui page è scrivibile, ma verrà controllata
    page = serializers.PrimaryKeyRelatedField(queryset=Page.objects.all())

    class Meta:
        model = Block
        fields = ['id', 'page', 'parent_block', 'type', 'content', 'position', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

class PageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Page
        fields = ['id', 'title', 'created_at', 'updated_at', 'position', 'parent','icon','favorite']
        read_only_fields = ['id', 'created_at', 'updated_at']

class PageDetailSerializer(PageSerializer):
    blocks = BlockSerializer(many=True, read_only=True)

    class Meta(PageSerializer.Meta):
        fields = PageSerializer.Meta.fields + ['blocks']