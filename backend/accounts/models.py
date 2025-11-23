# accounts/models.py
from django.db import models
from django.contrib.auth.models import User

class CustomerProfile(models.Model):
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="customer_profile",
    )
    phone = models.CharField(max_length=20, blank=True)
    contact_method = models.CharField(
        max_length=20,
        blank=True,              # "kakao", "sms", "email"
    )
    bank_name = models.CharField(max_length=50, blank=True)
    account_number = models.CharField(max_length=50, blank=True)
    memo = models.TextField(blank=True)

    def __str__(self):
        return f"[고객] {self.user.first_name or self.user.username}"
