const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);


app.use(cors({ origin: 'https://trivially-included-moth.ngrok-free.app' }));


app.use(express.static(path.join('app', 'templates')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'app', 'templates', 'home.html'));
});

const PORT = process.env.PORT || 9000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});


