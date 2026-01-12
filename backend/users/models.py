from django.contrib.auth.models import AbstractUser
from django.db import models

class User(AbstractUser):
    # Qui potremo aggiungere:
    # bio = models.TextField(...)
    # avatar = models.ImageField(...)
    
    def __str__(self):
        return self.username
