// server.js - Backend Server với Express.js
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware bảo mật
app.use(helmet());
app.use(cors({
    origin: '*' || 'http://localhost:8080',
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 phút
    max: 100, // Giới hạn 100 requests per 15 phút
    message: {
        error: 'Quá nhiều yêu cầu từ IP này, vui lòng thử lại sau.'
    }
});

app.use('/api/', limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Middleware logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Endpoint proxy cho Chatbase
app.post('/api/chat', async (req, res) => {
    try {
        const { message, timestamp } = req.body;
        
        // Validation
        if (!message || typeof message !== 'string') {
            return res.status(400).json({
                error: 'Tin nhắn không hợp lệ'
            });
        }

        if (message.length > 1000) {
            return res.status(400).json({
                error: 'Tin nhắn quá dài (tối đa 1000 ký tự)'
            });
        }

        // Gọi API Chatbase
        const chatbaseResponse = await axios.post(
            `https://www.chatbase.co/api/v1/chat`,
            {
                messages: [
                    {
                        role: 'user',
                        content: message
                    }
                ],
                chatbotId: process.env.CHATBASE_BOT_ID,
                stream: false,
                temperature: 0.7
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.CHATBASE_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000 // 30 giây timeout
            }
        );

        // Trả về response
        res.json({
            response: chatbaseResponse.data.text || 'Xin lỗi, tôi không thể trả lời lúc này.',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Chatbase API Error:', error.response?.data || error.message);
        
        // Xử lý các loại lỗi khác nhau
        if (error.code === 'ECONNABORTED') {
            return res.status(504).json({
                error: 'Timeout - Vui lòng thử lại'
            });
        }
        
        if (error.response?.status === 429) {
            return res.status(429).json({
                error: 'Quá nhiều yêu cầu - Vui lòng thử lại sau'
            });
        }
        
        if (error.response?.status === 401) {
            return res.status(500).json({
                error: 'Lỗi xác thực API'
            });
        }

        res.status(500).json({
            error: 'Lỗi server - Vui lòng thử lại sau'
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Serve static files (nếu muốn host frontend cùng backend)
app.use(express.static('public'));

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Endpoint không tồn tại'
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server Error:', err);
    res.status(500).json({
        error: 'Lỗi server nội bộ'
    });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    process.exit(0);
});

app.listen(PORT, () => {
    console.log(`Server đang chạy trên port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;