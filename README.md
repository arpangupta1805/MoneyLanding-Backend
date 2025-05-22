# Money Lending App - Backend

This is the backend API for the Money Lending App, built with Node.js, Express, and MongoDB.

## Features

- User authentication (register, login, profile management)
- Secure password encryption with bcrypt
- Strong password validation
- Username uniqueness verification
- JWT authentication
- Transaction management (create, read, update, delete)
- Payment tracking
- Borrower username verification with auto-fill functionality
- Role-based access control
- User address and village information management

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Create a `.env` file in the root directory with the following variables:
   ```
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/money-lending-app
   JWT_SECRET=your_jwt_secret_key_change_in_production
   JWT_EXPIRE=30d
   ```

3. Start the development server:
   ```
   npm run dev
   ```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login and get token (with optional address update)
- `GET /api/auth/me` - Get current user profile
- `POST /api/auth/check-username` - Check if username is available
- `POST /api/auth/validate-password` - Validate password strength

### Users
- `GET /api/users` - Get all users (admin only)
- `GET /api/users/:id` - Get user by ID (admin only)
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user (admin only)
- `GET /api/users/check/:username` - Check if username exists

### Transactions
- `POST /api/transactions` - Create a new transaction
- `GET /api/transactions` - Get all transactions for current user
- `GET /api/transactions/:id` - Get transaction by ID
- `PUT /api/transactions/:id` - Update transaction
- `DELETE /api/transactions/:id` - Delete transaction
- `POST /api/transactions/:id/payment` - Add payment to transaction
- `GET /api/transactions/check-borrower/:username` - Check if borrower username exists and get their details

## Borrower Username Verification & Auto-Fill

The API includes special features for borrower verification and auto-filling:

1. When creating a transaction, the system checks if the borrower's username exists in the database
2. If the username exists, the transaction is linked to that user's account and their details can be auto-filled
3. If the username doesn't exist, the transaction is still created but with a null borrowerId
4. The `/api/transactions/check-borrower/:username` endpoint can be used to verify usernames and get user details for auto-filling forms
5. Transactions are visible to both lenders and borrowers in their respective dashboards

## Password Strength Validation

The API includes password strength validation with the following criteria:
- Minimum length of 8 characters
- Contains at least one uppercase letter
- Contains at least one lowercase letter
- Contains at least one number
- Contains at least one special character

## User Information

Required user fields:
- Username (unique)
- Password
- Full Name
- Phone Number
- Village Name

Optional user fields:
- Address (can be updated during login) 