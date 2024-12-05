const express = require('express');
const router = express.Router();
const { ApiKey } = require('../models/db');

// 获取所有 API Keys
router.get('/', async (req, res) => {
    try {
        const keys = await ApiKey.find().select('-key');
        res.json(keys);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});





// 添加新的 API Key
router.post('/', async (req, res) => {
    const { key, description } = req.body;

    if (!key || !description) {
        return res.status(400).json({ message: 'Key 和描述是必需的' });
    }

    const apiKey = new ApiKey({ key, description });

    try {
        const newKey = await apiKey.save();
        res.status(201).json(newKey);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// 更新 API Key
router.patch('/:id', async (req, res) => {
    try {
        const key = await ApiKey.findById(req.params.id);
        if (req.body.description) {
            key.description = req.body.description;
        }
        if (typeof req.body.isActive === 'boolean') {
            key.isActive = req.body.isActive;
        }
        const updatedKey = await key.save();
        res.json(updatedKey);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// 删除 API Key
router.delete('/:id', async (req, res) => {
    try {
        await ApiKey.findByIdAndDelete(req.params.id);
        res.json({ message: 'API Key 已删除' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router; 