const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const axios = require('axios');
const { DateTime } = require('luxon');

mongoose.connect('mongodb+srv://jamesbondmc1001:VYvfHJFTbARHjvHM@cluster0.tyqvpls.mongodb.net/localApp', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const app = express();
app.use(express.json());
app.use(cors());

const db = mongoose.connection;
const usersCollection = db.collection('users'); // Using raw collection

// 🚀 Signup API
app.post('/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Check if user already exists
        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert user
        await usersCollection.insertOne({
            name,
            email,
            password: hashedPassword,
            lastLogin: null,
            lastLogout: null
        });

        res.status(201).json({ message: 'User created successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🔐 Login API (Updates Last Login Time and Resets Last Logout)
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check if user exists
        const user = await usersCollection.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'User not found' });
        }

        // Compare password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Update last login timestamp and reset last logout
        const lastLoginTime = new Date();
        await usersCollection.updateOne(
            { _id: user._id },
            { $set: { lastLogin: lastLoginTime, lastLogout: null } }
        );

        res.json({ message: 'Login successful', user: { ...user, lastLogin: lastLoginTime, lastLogout: null } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🚪 Logout API (Updates Last Logout Time)
app.post('/logout', async (req, res) => {
    try {
        const { email } = req.body;

        // Check if user exists
        const user = await usersCollection.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'User not found' });
        }

        // Update last logout timestamp
        const lastLogoutTime = new Date();
        await usersCollection.updateOne(
            { _id: user._id },
            { $set: { lastLogout: lastLogoutTime } }
        );

        res.json({ message: 'Logout successful', lastLogout: lastLogoutTime });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/users', async (req, res) => {
    try {
        const users = await usersCollection.find().toArray();

        const formattedUsers = users.map(user => ({
            _id: user._id,
            name: user.name,
            email: user.email,
            password: user.password,
            lastLogin: user.lastLogin
                ? DateTime.fromJSDate(new Date(user.lastLogin))
                    .setZone('Asia/Kolkata')
                    .toFormat('dd-MM-yyyy HH:mm:ss')
                : null,
            lastLogout: user.lastLogout
                ? DateTime.fromJSDate(new Date(user.lastLogout))
                    .setZone('Asia/Kolkata')
                    .toFormat('dd-MM-yyyy HH:mm:ss')
                : null
        }));

        res.json(formattedUsers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// ✏️ Update User Name and Password
app.put('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, password } = req.body;

        const updateFields = {};
        if (name) updateFields.name = name;
        if (password) updateFields.password = await bcrypt.hash(password, 10);

        const result = await usersCollection.updateOne(
            { _id: new mongoose.Types.ObjectId(id) },
            { $set: updateFields }
        );

        if (result.modifiedCount === 0) {
            return res.status(404).json({ message: 'User not found or no changes made' });
        }

        res.json({ message: 'User updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ❌ Delete User
app.delete('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await usersCollection.deleteOne({ _id: new mongoose.Types.ObjectId(id) });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 📊 Fetch Trending Pools
const getTrendingPools = async () => {
    try {
        const response = await axios.get('https://api.geckoterminal.com/api/v2/networks/trending_pools?page=1');
        return response.data;
    } catch (error) {
        throw new Error('Error fetching trending pools: ' + error.message);
    }
};

// Save object to user's bookmarks
app.post('/bookmark', async (req, res) => {
    try {
        const { email, crypto } = req.body;

        if (!email || !crypto) {
            return res.status(400).json({ message: 'Email and crypto object are required' });
        }

        // Check if user exists
        const user = await usersCollection.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if already bookmarked
        const isBookmarked = user.bookmarks?.some(b => b.id === crypto.id);
        if (isBookmarked) {
            return res.status(400).json({ message: 'Already bookmarked' });
        }

        // Update user document with new bookmark
        await usersCollection.updateOne(
            { email },
            { $push: { bookmarks: crypto } }
        );

        res.status(201).json({ message: 'Bookmark added successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete bookmark from user
app.delete('/bookmark', async (req, res) => {
    try {
        const { email, cryptoId } = req.body;

        if (!email || !cryptoId) {
            return res.status(400).json({ message: 'Email and crypto ID are required' });
        }

        const result = await usersCollection.updateOne(
            { email },
            { $pull: { bookmarks: { id: cryptoId } } }
        );

        if (result.modifiedCount === 0) {
            return res.status(404).json({ message: 'Bookmark not found' });
        }

        res.json({ message: 'Bookmark deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/bookmarks/:email', async (req, res) => {
    try {
        const { email } = req.params; // Get email from route params

        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }

        // Use projection { bookmarks: 1 } to fetch only bookmarks
        const user = await usersCollection.findOne({ email }, { projection: { bookmarks: 1 } });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({ success: true, bookmarks: user.bookmarks || [] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



// 🌍 Home Route
app.get('/home', async (req, res) => {
    try {
        const data = await getTrendingPools();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start Server
const port = process.env.PORT || 4001;
app.listen(port, () => {
    console.log(`Your server is live on port ${port}`);
});
