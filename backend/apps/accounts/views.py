from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.exceptions import AuthenticationFailed
from .serializers import UserSerializer
from .models import User
import jwt, datetime

# Create your views here.
class RegisterView(APIView):
    def post(self, request):
        serializer = UserSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)   
      
class ProfileView(APIView):
    pass

class ChangePasswordView(APIView):
    pass

class ProfileView(APIView):
    pass

class LoginView(APIView):
    def post(self, request):
        email = request.data['email']
        password = request.data['password']
        
        user = User.objects.filter(email=email).first()
        
        if user is None: # Reject authentication when the user does not exist
            raise AuthenticationFailed('User not found')
        
        if not user.check_password(password): # Verify the provided password against the stored password hash
            raise AuthenticationFailed('Incorrect password')
        
        payload = {
            'id': user.id,
            'exp': datetime.datetime.utcnow() + datetime.timedelta(minutes=60),
            'iat': datetime.datetime.utcnow()
        }
        
        token = jwt.encode({'id': user.id}, 'secret', algorithm='HS256')  # Generate a signed JWT for authenticated requests
              
        response = Response ()
        response.set_cookie(key='jwt', value=token, httponly=True)
        response.data = {"jwt": token}
        
        return response
    
class CustomerView(APIView):
    pass
        
class UserView(APIView):
    def get(self, request):
        token = request.COOKIES.get('jwt') # Retrieve the authentication token from the HTTP-only cookie
        
        if not token:
            raise AuthenticationFailed("Unauthenticated")
        
        try:
            payload = jwt.decode(token, 'secret', algorithms=['HS256']) # Validate and decode the JWT
        except jwt.ExpiredSignatureError:
            raise AuthenticationFailed("Unauthenticated")
        
        user = User.objects.filter(id=payload['id']).first()
        serializer = UserSerializer(user)
        
        return Response(serializer.data)
    
class LogoutView(APIView):
    def post(self, request):
        response = Response()
    
        response.delete_cookie("jwt") # Remove the authentication cookie to end the user's session
    
        response.data = {
            "message": "Successfully logged out"
        } 
    
        return response     
    