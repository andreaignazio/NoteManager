from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0012_page_favorite_position"),
    ]

    operations = [
        migrations.AddField(
            model_name="page",
            name="deleted_at",
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
        migrations.AddField(
            model_name="page",
            name="deleted_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="deleted_pages",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="page",
            name="trashed_favorite",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="page",
            name="trashed_favorite_position",
            field=models.CharField(blank=True, max_length=32, null=True),
        ),
        migrations.AddField(
            model_name="page",
            name="trashed_parent",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="trashed_children",
                to="core.page",
            ),
        ),
        migrations.AddField(
            model_name="page",
            name="trashed_position",
            field=models.CharField(blank=True, max_length=32, null=True),
        ),
    ]