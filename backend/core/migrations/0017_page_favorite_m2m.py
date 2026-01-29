from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings


def forwards_create_favorites(apps, schema_editor):
    Page = apps.get_model("core", "Page")
    PageFavorite = apps.get_model("core", "PageFavorite")

    favorites = (
        Page.objects.filter(favorite=True)
        .only("id", "owner_id", "favorite_position")
    )
    bulk = []
    for page in favorites:
        if not page.owner_id:
            continue
        bulk.append(
            PageFavorite(
                page_id=page.id,
                user_id=page.owner_id,
                position=page.favorite_position,
            )
        )

    if bulk:
        PageFavorite.objects.bulk_create(bulk, ignore_conflicts=True, batch_size=500)


def backwards_delete_favorites(apps, schema_editor):
    PageFavorite = apps.get_model("core", "PageFavorite")
    PageFavorite.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0016_remove_block_page_remove_block_parent_block_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="PageFavorite",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "position",
                    models.CharField(
                        blank=True,
                        db_index=True,
                        max_length=32,
                        null=True,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "page",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="favorites",
                        to="core.page",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="page_favorites",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "unique_together": {("page", "user")},
                "indexes": [
                    models.Index(fields=["user", "position"], name="core_fav_user_pos_idx"),
                    models.Index(fields=["page", "user"], name="core_fav_page_user_idx"),
                ],
            },
        ),
        migrations.RunPython(forwards_create_favorites, backwards_delete_favorites),
    ]
