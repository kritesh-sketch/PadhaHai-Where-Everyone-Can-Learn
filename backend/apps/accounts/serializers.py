from rest_framework import serializers
from .models import User

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["full_name", "email", "phone_number", "password", "role", "profile_picture", "is_active", "created_at", "updated_at"]
        extra_kwargs = {
            'password': {'write_only': True} # Prevent the password from being exposed in API responses
        }

    def validate_email(self, value):
        # Prevent duplicate accounts using the same email
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError(
                "An account with this email already exists."
            )
        return value

    def create(self, validated_data):
        password = validated_data.pop("password", None) # Extract the password before creating the user instance
        user = User(**validated_data)
        
        # Assign the default role
        user.role = User.Role.CUSTOMER
        
        # Hash the password before storing it
        user.set_password(password)
        
        User.save() 
        return user