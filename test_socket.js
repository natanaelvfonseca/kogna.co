import net from 'net';

const host = '62.171.145.215';
const port = 5432;

console.log(`Checking connection to ${host}:${port}...`);

const socket = new net.Socket();

socket.setTimeout(5000);

socket.on('connect', () => {
    console.log('✅ TCP Connection successful! The port is open.');
    socket.destroy();
    process.exit(0);
});

socket.on('timeout', () => {
    console.error('❌ Connection timeout! The server is not responding.');
    socket.destroy();
    process.exit(1);
});

socket.on('error', (err) => {
    console.error('❌ Connection error:', err.message);
    process.exit(1);
});

socket.connect(port, host);
