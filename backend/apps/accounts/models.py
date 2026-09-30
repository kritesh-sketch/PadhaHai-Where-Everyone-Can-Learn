from django.db import models # Create the custom user model
from django.contrib.auth.models import AbstractUser

class User(AbstractUser): # Create your models here.
    
    class Role(models.TextChoices):
        STUDENT = "STUDENT", "Student"
        INSTRUCTOR = "INSTRUCTOR", "Instructor"
        ADMIN = "ADMIN", "Admin"
       
    # Define the user's display name 
    full_name = models.CharField(max_length=255) 
    
    # Use email as the unique login identifier
    email = models.EmailField(max_length=255, unique=True) 
        
    # Store the user's phone number
    phone_number = models.CharField(max_length=20)
    
    # User role
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.STUDENT)
    
    # for uploading profile picture in profile page 
    profile_picture = models.ImageField(upload_to="profile_pictures/", blank=True, null=True)
    
    # for checking whether the plan is working or not 
    is_active = models.BooleanField(default=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True) 
    
    username = None # Disable username-based authentication
    
    USERNAME_FIELD = 'email' # Set email as the authentication field
    REQUIRED_FIELDS = [] # No additional required fields during user creation
