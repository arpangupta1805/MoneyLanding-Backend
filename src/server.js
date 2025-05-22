import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import transactionRoutes from './routes/transactions.js';
import { createServer } from 'http';

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const MONGODB_URI = process.env.MONGODB_URI;

// Middleware
app.use(express.json());
app.use(cors())

// Use morgan logger in development mode
if (NODE_ENV !== 'production') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/transactions', transactionRoutes);

// Root route
app.get('/', (req, res) => {
  res.send('Money Lending App API is running');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', environment: NODE_ENV });
});

// Connect to MongoDB
mongoose
  .connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log('Connected to MongoDB');
    // Create HTTP server
    const server = createServer(app);
    
    // Start server with port handling
    startServer(server, PORT);
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
  });

// Function to start server and handle port conflicts
function startServer(server, port) {
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.log(`Port ${port} is already in use, trying ${port + 1}...`);
      setTimeout(() => {
        server.close();
        startServer(server, port + 1);
      }, 1000);
    } else {
      console.error('Server error:', error);
    }
  });

  server.listen(port, () => {
    console.log(`Server running in ${NODE_ENV} mode on port ${port}`);
  });
}

export default app; 