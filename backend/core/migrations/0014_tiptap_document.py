from django.db import migrations, models
import uuid


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0013_page_soft_delete"),
    ]

    operations = [
        migrations.CreateModel(
            name="TiptapDocument",
            fields=[
                ("id", models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                (
                    "page",
                    models.OneToOneField(
                        on_delete=models.deletion.CASCADE,
                        related_name="tiptap_doc",
                        to="core.page",
                    ),
                ),
                ("content", models.JSONField(blank=True, default=dict)),
                ("version", models.IntegerField(default=1)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
        ),
    ]
