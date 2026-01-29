from django.conf import settings
from django.core.management.base import BaseCommand

from core.utils.yjs_compact import compact_all_rooms, compact_room


class Command(BaseCommand):
    help = "Compact Yjs updates into a single snapshot per room."

    def add_arguments(self, parser):
        parser.add_argument("--room", type=str, help="Room name to compact (e.g., page:<uuid>)")
        parser.add_argument(
            "--db", type=str, default=str(settings.YJS_STORE_PATH), help="Path to yjs sqlite store"
        )

    def handle(self, *args, **options):
        db_path = options["db"]
        room = options.get("room")
        if room:
            ok = compact_room(room, db_path)
            self.stdout.write(self.style.SUCCESS("Compacted") if ok else "No updates")
            return
        count = compact_all_rooms(db_path)
        self.stdout.write(self.style.SUCCESS(f"Compacted rooms: {count}"))
