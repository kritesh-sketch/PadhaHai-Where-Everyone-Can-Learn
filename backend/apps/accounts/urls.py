from django.urls import path
from .views import (RegisterView, LoginView, LogoutView, 
                    UserView, ProfileView, ChangePasswordView)

urlpatterns = [
    # Authentication
    path("register/", RegisterView.as_view(), name="register",),
    path("login/", LoginView.as_view(), name="login",),
    path("logout/", LogoutView.as_view(), name="logout",),

    # Current authenticated user
    path("me/", UserView.as_view(), name="me",),

    # User profile
    path("profile/", ProfileView.as_view(), name="profile",),

    # Password management
    path("change-password/", ChangePasswordView.as_view(), name="change_password",),
]